import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import {
  buildContentDisposition,
  S3_API_ROUTES,
  uploadBodySchema,
  type UploadPresignResponse,
} from "@dimah-s3/core";
import { errors } from "../../errors";
import {
  normalizeExpiresIn,
  resolveRequestAcl,
  runHook,
  runLifecycleHook,
} from "../../helpers";
import type { ResolvedDimahS3Config } from "../../types";
import { resolveRequestTarget } from "../../helpers/resolve-target";
import { assertFeatureEnabled } from "../assert-feature-enabled";
import { createS3Endpoint } from "../create-s3-endpoint";

function putMetadataHeaders(
  metadata: Record<string, string> | undefined,
): Record<string, string> {
  if (!metadata) return {};
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(metadata)) {
    headers[`x-amz-meta-${k}`] = v;
  }
  return headers;
}

async function handleUpload(
  config: ResolvedDimahS3Config,
  input: typeof uploadBodySchema._output,
  request: Request,
): Promise<UploadPresignResponse> {
  const { key, bucket } = await resolveRequestTarget(config, config.upload, {
    request,
    key: input.key,
    bucket: input.bucket,
    fileName: input.fileName,
    contentType: input.contentType,
  });
  const expiresIn = normalizeExpiresIn(input.expiresIn, config.maxExpiresIn);
  const acl = resolveRequestAcl(config.upload, input.acl);
  const contentType = input.contentType ?? "application/octet-stream";
  const fileSize =
    typeof input.fileSize === "number" && input.fileSize > 0
      ? Math.floor(input.fileSize)
      : null;

  await runHook(config.upload?.guard, {
    request,
    key,
    bucket,
    contentType: input.contentType,
    fileSize: fileSize ?? undefined,
    metadata: input.metadata,
    acl,
    fileName: input.fileName,
  });

  const method = config.upload?.method ?? "POST";

  if (config.upload?.requireFileSize && fileSize === null) {
    throw errors.fileSizeRequiredUpload();
  }

  if (method === "PUT") {
    const putHeaders: Record<string, string> = {
      "Content-Type": contentType,
      ...putMetadataHeaders(input.metadata),
    };
    if (input.fileName) {
      putHeaders["Content-Disposition"] = buildContentDisposition(
        input.fileName,
      );
    }

    const url = await getSignedUrl(
      config.client,
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
        ACL: acl,
        Metadata: input.metadata,
        ...(input.fileName
          ? { ContentDisposition: buildContentDisposition(input.fileName) }
          : {}),
        ...(fileSize !== null ? { ContentLength: fileSize } : {}),
      }),
      {
        expiresIn,
        ...(fileSize !== null
          ? { signableHeaders: new Set(["content-length"]) }
          : {}),
      },
    );

    await runLifecycleHook(config.upload?.onPresigned, {
      request,
      key,
      bucket,
      contentType: input.contentType,
      fileSize: fileSize ?? undefined,
      metadata: input.metadata,
      acl,
      fileName: input.fileName,
      url,
      expiresIn,
    });

    return {
      bucket,
      key,
      url,
      headers: putHeaders,
      expiresIn,
      method: "PUT",
    };
  }

  const fields: Record<string, string> = { acl, "Content-Type": contentType };

  if (input.fileName) {
    fields["Content-Disposition"] = buildContentDisposition(input.fileName);
  }

  if (input.metadata) {
    for (const [k, v] of Object.entries(input.metadata)) {
      fields[`x-amz-meta-${k}`] = v;
    }
  }

  const rangeMin = fileSize ?? 1;
  const rangeMax = fileSize ?? undefined;

  const { url, fields: signedFields } = await createPresignedPost(
    config.client,
    {
      Bucket: bucket,
      Key: key,
      Conditions:
        rangeMax !== undefined
          ? [["content-length-range", rangeMin, rangeMax]]
          : [["content-length-range", rangeMin, Number.MAX_SAFE_INTEGER]],
      Fields: fields,
      Expires: expiresIn,
    },
  );

  await runLifecycleHook(config.upload?.onPresigned, {
    request,
    key,
    bucket,
    contentType: input.contentType,
    fileSize: fileSize ?? undefined,
    metadata: input.metadata,
    acl,
    fileName: input.fileName,
    url,
    expiresIn,
  });

  return {
    bucket,
    key,
    url,
    fields: signedFields,
    expiresIn,
    method: "POST",
  };
}

export const upload = createS3Endpoint(
  S3_API_ROUTES.upload,
  { method: "POST", body: uploadBodySchema },
  async (ctx) => {
    assertFeatureEnabled(ctx.context.config, "upload");
    return handleUpload(ctx.context.config, ctx.body, ctx.context.request);
  },
);
