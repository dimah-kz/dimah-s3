import { AbortMultipartUploadCommand } from "@aws-sdk/client-s3";
import type { MultipartAbortResponse } from "@dimah-s3/core";
import { requireString } from "../../errors";
import { runHook, runLifecycleHook } from "../../internal-helpers";
import type { DimahS3Config } from "../../types";

export type MultipartAbortInput = {
  key: string;
  uploadId: string;
  bucket?: string;
};

export async function multipartAbort(
  config: DimahS3Config,
  input: MultipartAbortInput,
  request: Request,
): Promise<
  MultipartAbortResponse & { bucket: string; key: string; uploadId: string }
> {
  const key = requireString(input.key, "key");
  const uploadId = requireString(input.uploadId, "uploadId");
  const bucket = input.bucket?.trim() || config.defaultBucket;

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
