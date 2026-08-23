import { CompleteMultipartUploadCommand } from "@aws-sdk/client-s3";
import {
  multipartCompleteBodySchema,
  parseFileName,
  S3_API_ROUTES,
  type MultipartCompleteResponse,
} from "@dimah-s3/core";
import { errors } from "../../../errors";
import {
  headObjectAfterMultipartComplete,
  listAllParts,
  requireContentLength,
  resolveObjectAcl,
  resolveRequestTarget,
  runHook,
  runLifecycleHook,
  sendOrObjectNotFound,
} from "../../../helpers";
import type { ResolvedDimahS3Config } from "../../../types";
import { assertFeatureEnabled } from "../../assert-feature-enabled";
import { createS3Endpoint } from "../../create-s3-endpoint";

async function handleComplete(
  config: ResolvedDimahS3Config,
  input: typeof multipartCompleteBodySchema._output,
  request: Request,
): Promise<MultipartCompleteResponse> {
  const { key, bucket } = await resolveRequestTarget(config, config.multipart, {
    request,
    key: input.key,
    bucket: input.bucket,
  });
  const uploadId = input.uploadId;
  const parts = input.parts
    .map(({ partNumber }) => partNumber)
    .sort((a, b) => a - b);
  const partRefs = parts.map((partNumber) => ({ partNumber }));

  await runHook(config.multipart?.completeGuard, {
    request,
    key,
    bucket,
    uploadId,
    parts: partRefs,
  });

  const listedParts = await listAllParts(config.client, {
    bucket,
    key,
    uploadId,
  });

  const completeParts = parts.map((partNumber) => {
    const found = listedParts.find((p) => p.PartNumber === partNumber);
    if (!found?.ETag) {
      throw errors.multipartPartMissing(partNumber);
    }
    return { PartNumber: partNumber, ETag: found.ETag };
  });

  const completeResult = await sendOrObjectNotFound(() =>
    config.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: { Parts: completeParts },
      }),
    ),
  );

  const head = await headObjectAfterMultipartComplete(
    config.client,
    bucket,
    key,
  );
  const contentLength = requireContentLength(head);
  const contentType = head.ContentType;
  const eTag = (head.ETag ?? completeResult.ETag ?? "").replace(/"/g, "");
  const metadata = head.Metadata ?? {};
  const versionId = head.VersionId;
  const lastModified = head.LastModified?.toISOString();

  const acl = config.resolveObjectAcl
    ? await resolveObjectAcl(config.client, bucket, key)
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
