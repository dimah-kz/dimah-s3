import { AbortMultipartUploadCommand } from "@aws-sdk/client-s3";
import {
  multipartAbortBodySchema,
  S3_API_ROUTES,
  type MultipartAbortResponse,
} from "@dimah-s3/core";
import {
  openStoredTarget,
  runHook,
  runLifecycleHook,
  sendOrObjectNotFound,
} from "@/helpers";
import type { ResolvedDimahS3Config } from "@/types";
import { createS3Endpoint } from "@/api/create-s3-endpoint";

async function handleAbort(
  config: ResolvedDimahS3Config,
  input: typeof multipartAbortBodySchema._output,
  request: Request,
): Promise<MultipartAbortResponse> {
  const { route, key, bucket, stored } = await openStoredTarget(
    config,
    input,
    request,
    "multipart",
  );
  const uploadId = input.uploadId;

  await runHook(route.upload.multipart.guard, {
    ...stored,
    uploadId,
    action: "abort",
  });

  await sendOrObjectNotFound(() =>
    route.client.send(
      new AbortMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
      }),
    ),
  );

  await runLifecycleHook(
    route.upload.multipart.onAbort,
    {
      ...stored,
      uploadId,
    },
    config,
  );

  return { bucket, key, uploadId, aborted: true };
}

export const multipartAbort = createS3Endpoint(
  S3_API_ROUTES.multipartAbort,
  { method: "POST", body: multipartAbortBodySchema },
  async (ctx) => {
    return handleAbort(ctx.context.config, ctx.body, ctx.context.request);
  },
);
