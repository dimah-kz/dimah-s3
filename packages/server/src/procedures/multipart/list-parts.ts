import { ListPartsCommand } from "@aws-sdk/client-s3";
import type { MultipartListPartsResponse } from "@dimah-s3/core";
import { errors } from "../../errors";
import { runHook, runLifecycleHook } from "../../internal-helpers";
import type { DimahS3Config } from "../../types";

export type MultipartListPartsInput = {
  key: string;
  uploadId: string;
  bucket?: string;
};

export async function multipartListParts(
  config: DimahS3Config,
  input: MultipartListPartsInput,
  request: Request,
): Promise<MultipartListPartsResponse> {
  const key = input.key?.trim() ?? "";
  const uploadId = input.uploadId?.trim() ?? "";
  const bucketParam = input.bucket?.trim();

  if (!key) {
    throw errors.keyRequired();
  }
  if (!uploadId) {
    throw errors.uploadIdRequired();
  }

  const bucket = bucketParam || config.defaultBucket;

  await runHook(config.multipart?.listGuard, {
    request,
    key,
    bucket,
    uploadId,
  });

  const response = await config.s3.send(
    new ListPartsCommand({
      Bucket: bucket,
      Key: key,
      UploadId: uploadId,
    }),
  );

  const parts = (response.Parts ?? []).map((p) => ({
    partNumber: p.PartNumber ?? 0,
    size: p.Size ?? 0,
    eTag: (p.ETag ?? "").replace(/"/g, ""),
  }));

  await runLifecycleHook(config.multipart?.onList, {
    request,
    key,
    bucket,
    uploadId,
    parts,
  });

  return { parts };
}
