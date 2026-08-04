import { UploadPartCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { MultipartPartResponse } from "@dimah-s3/core";
import { errors, requireString } from "../../errors";
import { normalizeExpiresIn, runHook } from "../../internal-helpers";
import type { DimahS3Config } from "../../types";

export type MultipartSignPartInput = {
  key: string;
  uploadId: string;
  partNumber: number;
  partSize?: number;
  bucket?: string;
  expiresIn?: number;
};

export async function multipartSignPart(
  config: DimahS3Config,
  input: MultipartSignPartInput,
  request: Request,
): Promise<MultipartPartResponse> {
  const key = requireString(input.key, "key");
  const uploadId = requireString(input.uploadId, "uploadId");
  const partNumber = Number(input.partNumber);
  if (!Number.isInteger(partNumber) || partNumber <= 0) {
    throw errors.partNumberInvalid();
  }

  const bucket = input.bucket?.trim() || config.defaultBucket;
  const expiresIn = normalizeExpiresIn(input.expiresIn);
  const partSize =
    typeof input.partSize === "number" && input.partSize > 0
      ? Math.floor(input.partSize)
      : null;

  await runHook(config.multipart?.partGuard, {
    request,
    key,
    bucket,
    uploadId,
    partNumber,
    partSize: partSize ?? undefined,
  });

  const presignedUrl = await getSignedUrl(
    config.s3,
    new UploadPartCommand({
      Bucket: bucket,
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
      ...(partSize !== null ? { ContentLength: partSize } : {}),
    }),
    {
      expiresIn,
      ...(partSize !== null
        ? { signableHeaders: new Set(["content-length"]) }
        : {}),
    },
  );

  return {
    presignedUrl,
    partNumber,
    uploadId,
    bucket,
    expiresIn,
    ...(partSize !== null ? { partSize } : {}),
  };
}
