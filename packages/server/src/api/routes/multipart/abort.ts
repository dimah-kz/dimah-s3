import { AbortMultipartUploadCommand } from "@aws-sdk/client-s3";
import {
  multipartAbortBodySchema,
  S3_API_ROUTES,
  type MultipartAbortResponse,
} from "@dimah-s3/core";
import { runHook, runLifecycleHook } from "../../../internal-helpers";
import type { DimahS3Config } from "../../../types";
import { assertFeatureEnabled } from "../../assert-feature-enabled";
import { createS3Endpoint } from "../../create-s3-endpoint";

async function handleAbort(
  config: DimahS3Config,
  input: typeof multipartAbortBodySchema._output,
  request: Request,
): Promise<
  MultipartAbortResponse & { bucket: string; key: string; uploadId: string }
> {
  const key = input.key;
  const uploadId = input.uploadId;
  const bucket = input.bucket ?? config.defaultBucket;

  await runHook(config.multipart?.abortGuard, {
    request,
    key,
    bucket,
    uploadId,
  });

  await config.s3.send(
    new AbortMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      UploadId: uploadId,
    }),
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
