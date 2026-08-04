import { CreateMultipartUploadCommand } from "@aws-sdk/client-s3";
import type { MultipartInitResponse } from "@dimah-s3/core";
import { buildContentDisposition } from "@dimah-s3/core";
import { errors, requireString } from "../../errors";
import { runHook, runLifecycleHook } from "../../internal-helpers";
import type { DimahS3Config } from "../../types";

export type MultipartInitInput = {
  key: string;
  bucket?: string;
  contentType?: string;
  fileSize?: number;
  metadata?: Record<string, string>;
  acl?: "private" | "public-read";
  fileName?: string;
};

export async function multipartInit(
  config: DimahS3Config,
  input: MultipartInitInput,
  request: Request,
): Promise<MultipartInitResponse> {
  const key = requireString(input.key, "key");
  const bucket = input.bucket?.trim() || config.defaultBucket;
  const acl = input.acl === "public-read" ? "public-read" : "private";
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
  });

  const { UploadId } = await config.s3.send(
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
  );

  await runLifecycleHook(config.multipart?.onInit, {
    request,
    key,
    bucket,
    uploadId: UploadId!,
    contentType: input.contentType,
    fileSize,
    metadata: input.metadata,
    acl,
    fileName: input.fileName,
  });

  return { bucket, key, uploadId: UploadId! };
}
