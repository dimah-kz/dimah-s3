import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import {
  buildContentDisposition,
  S3_API_ROUTES,
  uploadBodySchema,
  type UploadPresignResponse,
} from "@dimah-s3/core";
import {
  assertDeclaredConstraints,
  normalizeExpiresIn,
  openRoute,
  resolveUploadTarget,
  runHook,
  runLifecycleHook,
} from "@/helpers";
import type { ResolvedDimahS3Config } from "@/types";
import { createS3Endpoint } from "@/api/create-s3-endpoint";

function objectUserMetadata(
  metadata: Record<string, string> | undefined,
): Record<string, string> {
  if (!metadata) return {};
  const fields: Record<string, string> = {};
  for (const [k, v] of Object.entries(metadata)) {
    fields[`x-amz-meta-${k}`] = v;
  }
  return fields;
}

async function handleUpload(
  config: ResolvedDimahS3Config,
  input: typeof uploadBodySchema._output,
  request: Request,
): Promise<UploadPresignResponse> {
  const route = await openRoute(config, input.route, request, "upload");

  const fileSize = Math.floor(input.fileSize);
  const fileName = input.fileName;
  assertDeclaredConstraints(route.upload, {
    fileName,
    fileSize,
    contentType: input.contentType,
  });

  const { key, bucket, metadata, acl } = await resolveUploadTarget(route, {
    request,
    route: route.name,
    file: {
      name: fileName,
      size: fileSize,
      type: input.contentType,
    },
    clientMetadata: input.metadata,
  });
  const expiresIn = normalizeExpiresIn(
    route.upload.expiresIn,
    config.maxExpiresIn,
  );
  const contentType = input.contentType ?? "application/octet-stream";
  const hookCtx = {
    request,
    route: route.name,
    key,
    bucket,
    contentType: input.contentType,
    fileSize,
    metadata,
    clientMetadata: input.metadata,
    acl,
    fileName,
  };

  await runHook(route.upload.guard, hookCtx);

  const method = route.upload.method ?? "POST";

  if (method === "PUT") {
    const putHeaders: Record<string, string> = {
      "Content-Type": contentType,
      ...objectUserMetadata(metadata),
      "Content-Disposition": buildContentDisposition(fileName),
    };

    const url = await getSignedUrl(
      route.client,
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
        ACL: acl,
        Metadata: metadata,
        ContentDisposition: buildContentDisposition(fileName),
        ContentLength: fileSize,
      }),
      {
        expiresIn,
        signableHeaders: new Set(["content-length"]),
      },
    );

    await runLifecycleHook(route.upload.onPresigned, {
      ...hookCtx,
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

  const fields: Record<string, string> = {
    acl,
    "Content-Type": contentType,
    "Content-Disposition": buildContentDisposition(fileName),
    ...objectUserMetadata(metadata),
  };

  const { url, fields: signedFields } = await createPresignedPost(
    route.client,
    {
      Bucket: bucket,
      Key: key,
      Conditions: [["content-length-range", fileSize, fileSize]],
      Fields: fields,
      Expires: expiresIn,
    },
  );

  await runLifecycleHook(route.upload.onPresigned, {
    ...hookCtx,
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
    return handleUpload(ctx.context.config, ctx.body, ctx.context.request);
  },
);
