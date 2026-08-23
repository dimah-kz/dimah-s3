import { AbortMultipartUploadCommand } from "@aws-sdk/client-s3";
import {
  multipartAbortBodySchema,
  S3_API_ROUTES,
  type MultipartAbortResponse,
} from "@dimah-s3/core";
import {
  resolveRequestTarget,
  runHook,
  runLifecycleHook,
  sendOrObjectNotFound,
} from "@/helpers";
import type { ResolvedDimahS3Config } from "@/types";
import { assertFeatureEnabled } from "@/api/assert-feature-enabled";
import { createS3Endpoint } from "@/api/create-s3-endpoint";

async function handleAbort(
  config: ResolvedDimahS3Config,
  input: typeof multipartAbortBodySchema._output,
  request: Request,
): Promise<MultipartAbortResponse> {
  const { key, bucket } = await resolveRequestTarget(config, config.multipart, {
    request,
    key: input.key,
    bucket: input.bucket,
  });
  const uploadId = input.uploadId;

  await runHook(config.multipart?.abortGuard, {
    request,
    key,
    bucket,
    uploadId,
  });

  await sendOrObjectNotFound(() =>
    config.client.send(
      new AbortMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
      }),
    ),
  );

  await runLifecycleHook(config.multipart?.onAbort, {
    request,
    key,
    bucket,
    uploadId,
  });

  return { bucket, key, uploadId, aborted: true };
}

export const multipartAbort = createS3Endpoint(
  S3_API_ROUTES.multipartAbort,
  { method: "POST", body: multipartAbortBodySchema },
  async (ctx) => {
    assertFeatureEnabled(ctx.context.config, "multipart");
    return handleAbort(ctx.context.config, ctx.body, ctx.context.request);
  },
);
