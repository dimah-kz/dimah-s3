import { AbortMultipartUploadCommand } from "@aws-sdk/client-s3";
import type { MultipartAbortResponse } from "@dimah-s3/core";
import { runGuards, runLifecycle } from "@/helpers/hooks";
import { sendOrObjectNotFound } from "@/helpers/is-aws-not-found";
import { runOperation } from "@/operations/run-operation";
import type { S3ServerCallOptions } from "@/types/config";
import type { ResolvedConfig } from "@/types/resolved";
import { openMultipart, type MultipartTicketBody } from "./open-multipart";

/**
 * Aborts a multipart upload (`POST /presign/multipart/abort`,
 * `s3.api.multipart.abort`).
 *
 * The ticket is accepted for 7 days after it expires, so an abandoned upload
 * can still be cleaned up. After `upload.multipart.guard`
 * (`action: "abort"`), AbortMultipartUpload runs, then
 * `upload.multipart.onAbort`. An upload that no longer exists fails with
 * `OBJECT_NOT_FOUND`.
 */
export function abortMultipart(
  config: ResolvedConfig,
  body: MultipartTicketBody,
  options: S3ServerCallOptions = {},
): Promise<MultipartAbortResponse> {
  return runOperation(config, "multipart.abort", options, async (call) => {
    const { route, context } = await openMultipart(config, call, body.ticket);
    await runGuards(route.upload.multipart.guard, {
      ...context,
      action: "abort",
    });
    await sendOrObjectNotFound(() =>
      route.client.send(
        new AbortMultipartUploadCommand({
          Bucket: context.bucket,
          Key: context.key,
          UploadId: context.uploadId,
        }),
      ),
    );
    await runLifecycle(route.upload.multipart.onAbort, context);
    return { key: context.key, uploadId: context.uploadId };
  });
}
