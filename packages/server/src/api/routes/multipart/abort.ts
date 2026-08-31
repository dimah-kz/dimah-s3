import { AbortMultipartUploadCommand } from "@aws-sdk/client-s3";
import {
  multipartAbortBodySchema,
  S3_API_ROUTES,
  type MultipartAbortResponse,
} from "@dimah-s3/core";
import {
  getResolvedRoute,
  resolveStoredTarget,
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
  const route = getResolvedRoute(config, input.route);
  assertFeatureEnabled(route, "multipart");
  await runHook(route.guard, { request, route: route.name });

  const { key, bucket } = resolveStoredTarget(route, "multipart", input.key);
  const uploadId = input.uploadId;

  await runHook(route.multipart?.abortGuard, {
    request,
    route: route.name,
    key,
    bucket,
    uploadId,
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

  await runLifecycleHook(route.multipart?.onAbort, {
    request,
    route: route.name,
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
    return handleAbort(ctx.context.config, ctx.body, ctx.context.request);
  },
);
