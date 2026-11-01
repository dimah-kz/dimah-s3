import { AbortMultipartUploadCommand } from "@aws-sdk/client-s3";
import {
  isS3ErrorCode,
  s3Error,
  type MultipartAbortResponse,
} from "@dimah-s3/core";
import { isAwsNotFound } from "@/helpers/aws-errors";
import { headObjectOrNotFound } from "@/helpers/head-object";
import { runGuards, runLifecycle } from "@/helpers/hooks";
import { readUploadMarker } from "@/helpers/object-meta";
import { runOperation } from "@/operations/run-operation";
import type { S3ServerCallOptions } from "@/types/config";
import type { MultipartUploadContext } from "@/types/hook-contexts";
import type { OpenedRoute, ResolvedConfig } from "@/types/resolved";
import { openMultipart, type MultipartTicketBody } from "./open-multipart";

/**
 * Aborts a multipart upload (`POST /presign/multipart/abort`,
 * `s3.api.multipart.abort`).
 *
 * The ticket is accepted for 7 days after it expires, so an abandoned upload
 * can still be cleaned up. After `upload.multipart.guard`
 * (`action: "abort"`), AbortMultipartUpload runs, then
 * `upload.multipart.onAbort`.
 *
 * Abort is idempotent, like delete: an upload that is already gone (aborted
 * before, or removed by a bucket lifecycle rule) succeeds and still runs
 * `onAbort`, so its bookkeeping is cleaned up. An upload that was completed
 * instead fails with `CONFLICT`: its object carries this upload's marker.
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
    try {
      await route.client.send(
        new AbortMultipartUploadCommand({
          Bucket: context.bucket,
          Key: context.key,
          UploadId: context.uploadId,
        }),
      );
    } catch (error) {
      if (!isAwsNotFound(error)) throw error;
      if (await wasCompleted(route, context)) throw s3Error("CONFLICT");
    }
    await runLifecycle(route.upload.multipart.onAbort, context);
    return {
      key: context.key,
      bucket: context.bucket,
      uploadId: context.uploadId,
    };
  });
}

/** Whether the key holds the object this upload completed. */
async function wasCompleted(
  route: OpenedRoute<"multipart">,
  context: MultipartUploadContext,
): Promise<boolean> {
  try {
    const head = await headObjectOrNotFound(
      route.client,
      context.bucket,
      context.key,
    );
    return readUploadMarker(head.Metadata) === context.uploadToken;
  } catch (error) {
    if (isS3ErrorCode(error, "OBJECT_NOT_FOUND")) return false;
    throw error;
  }
}
