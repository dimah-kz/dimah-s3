import {
  CompleteMultipartUploadCommand,
  HeadObjectCommand,
  ListPartsCommand,
} from "@aws-sdk/client-s3";
import {
  multipartCompleteBodySchema,
  parseFileName,
  S3_API_ROUTES,
  type MultipartCompleteResponse,
} from "@dimah-s3/core";
import { resolveObjectAcl } from "../../../helpers";
import { runHook, runLifecycleHook } from "../../../internal-helpers";
import type { DimahS3Config } from "../../../types";
import { assertFeatureEnabled } from "../../assert-feature-enabled";
import { createS3Endpoint } from "../../create-s3-endpoint";

async function handleComplete(
  config: DimahS3Config,
  input: typeof multipartCompleteBodySchema._output,
  request: Request,
): Promise<MultipartCompleteResponse> {
  const key = input.key;
  const uploadId = input.uploadId;
  const parts = input.parts
    .map(({ partNumber }) => partNumber)
    .sort((a, b) => a - b);
  const bucket = input.bucket ?? config.defaultBucket;
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

export const multipartComplete = createS3Endpoint(
  S3_API_ROUTES.multipartComplete,
  { method: "POST", body: multipartCompleteBodySchema },
  async (ctx) => {
    assertFeatureEnabled(ctx.context.config, "multipart");
    return handleComplete(ctx.context.config, ctx.body, ctx.context.request);
  },
);
