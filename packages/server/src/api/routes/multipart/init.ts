import {
  CreateMultipartUploadCommand,
  type CreateMultipartUploadCommandOutput,
} from "@aws-sdk/client-s3";
import {
  buildContentDisposition,
  multipartInitBodySchema,
  S3_API_ROUTES,
  type MultipartInitResponse,
} from "@dimah-s3/core";
import { errors } from "@/errors";
import {
  resolveRequestAcl,
  resolveRequestTarget,
  runHook,
  runLifecycleHook,
} from "@/helpers";
import type { ResolvedDimahS3Config } from "@/types";
import { assertFeatureEnabled } from "@/api/assert-feature-enabled";
import { createS3Endpoint } from "@/api/create-s3-endpoint";

async function handleMultipartInit(
  config: ResolvedDimahS3Config,
  input: typeof multipartInitBodySchema._output,
  request: Request,
): Promise<MultipartInitResponse> {
  const { key, bucket } = await resolveRequestTarget(config, config.multipart, {
    request,
    key: input.key,
    bucket: input.bucket,
    fileName: input.fileName,
    contentType: input.contentType,
  });
  const acl = resolveRequestAcl(config.multipart, input.acl);
  const fileSize =
    typeof input.fileSize === "number" && input.fileSize > 0
      ? Math.floor(input.fileSize)
      : undefined;

  if (config.multipart?.requireFileSize && fileSize === undefined) {
    throw errors.fileSizeRequiredMultipart();
  }

  await runHook(config.multipart?.initGuard, {
    request,
    key,
    bucket,
    fileSize,
    contentType: input.contentType,
    metadata: input.metadata,
    acl,
    fileName: input.fileName,
  });

  const { UploadId } = (await config.client.send(
    new CreateMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      ContentType: input.contentType,
      ContentDisposition: input.fileName
        ? buildContentDisposition(input.fileName)
        : undefined,
      Metadata: input.metadata,
      ACL: acl,
    }),
  )) as CreateMultipartUploadCommandOutput;

  if (!UploadId) {
    throw errors.internalError();
  }

  await runLifecycleHook(config.multipart?.onInit, {
    request,
    key,
    bucket,
    uploadId: UploadId,
    contentType: input.contentType,
    fileSize,
    metadata: input.metadata,
    acl,
    fileName: input.fileName,
  });

  return { bucket, key, uploadId: UploadId };
}

export const multipartInit = createS3Endpoint(
  S3_API_ROUTES.multipartInit,
  { method: "POST", body: multipartInitBodySchema },
  async (ctx) => {
    assertFeatureEnabled(ctx.context.config, "multipart");
    ctx.setStatus(201);
    return handleMultipartInit(
      ctx.context.config,
      ctx.body,
      ctx.context.request,
    );
  },
);
