import {
  CompleteMultipartUploadCommand,
  HeadObjectCommand,
  ListPartsCommand,
} from "@aws-sdk/client-s3";
import type { MultipartCompleteResponse } from "@dimah-s3/core";
import { parseFileName } from "@dimah-s3/core";
import { errors, requireString } from "../../errors";
import { resolveObjectAcl } from "../../helpers";
import { runHook, runLifecycleHook } from "../../internal-helpers";
import type { DimahS3Config } from "../../types";

export type MultipartCompleteInput = {
  key: string;
  uploadId: string;
  bucket?: string;
  parts: { partNumber: number }[];
};

export async function multipartComplete(
  config: DimahS3Config,
  input: MultipartCompleteInput,
  request: Request,
): Promise<MultipartCompleteResponse> {
  const key = requireString(input.key, "key");
  const uploadId = requireString(input.uploadId, "uploadId");

  const parts = (Array.isArray(input.parts) ? input.parts : [])
    .map(({ partNumber }) => Number(partNumber))
    .filter((n) => Number.isInteger(n) && n > 0)
    .sort((a, b) => a - b);

  if (!parts.length) {
    throw errors.partsRequired();
  }

  const bucket = input.bucket?.trim() || config.defaultBucket;
  const partRefs = parts.map((partNumber) => ({ partNumber }));

  await runHook(config.multipart?.completeGuard, {
    request,
    key,
    bucket,
    uploadId,
    parts: partRefs,
  });

  const listed = await config.s3.send(
    new ListPartsCommand({ Bucket: bucket, Key: key, UploadId: uploadId }),
  );
  const listedParts = listed.Parts ?? [];

  const completeParts = parts.map((partNumber) => {
    const found = listedParts.find((p) => p.PartNumber === partNumber);
    return { PartNumber: partNumber, ETag: found?.ETag ?? "" };
  });

  const completeResult = await config.s3.send(
    new CompleteMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: { Parts: completeParts },
    }),
  );

  let head = await config.s3.send(
    new HeadObjectCommand({ Bucket: bucket, Key: key }),
  );
  for (let attempt = 0; attempt < 4 && !head.ContentLength; attempt++) {
    await new Promise((r) => setTimeout(r, 250 * 2 ** attempt));
    head = await config.s3.send(
      new HeadObjectCommand({ Bucket: bucket, Key: key }),
    );
  }
  const contentLength = head.ContentLength ?? 0;
  const contentType = head.ContentType;
  const eTag = (head.ETag ?? completeResult.ETag ?? "").replace(/"/g, "");
  const metadata = head.Metadata ?? {};
  const versionId = head.VersionId;
  const lastModified = head.LastModified?.toISOString();

  const acl = config.resolveObjectAcl
    ? await resolveObjectAcl(config.s3, bucket, key)
    : undefined;
  const fileName = parseFileName(head.ContentDisposition);

  await runLifecycleHook(config.multipart?.onComplete, {
    request,
    key,
    bucket,
    uploadId,
    contentLength,
    contentType,
    eTag,
    metadata,
    acl,
    fileName,
    versionId,
    lastModified,
  });

  return {
    bucket,
    key,
    uploadId,
    contentLength,
    contentType,
    eTag,
    metadata,
    acl,
    fileName,
    versionId,
    lastModified,
  };
}
