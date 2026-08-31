import {
  CompleteMultipartUploadCommand,
  type CompleteMultipartUploadCommandOutput,
} from "@aws-sdk/client-s3";
import {
  multipartCompleteBodySchema,
  resolveStoredFileName,
  S3_API_ROUTES,
  type MultipartCompleteResponse,
} from "@dimah-s3/core";
import { errors } from "@/errors";
import {
  abortMultipartBestEffort,
  assertVerifiedConstraints,
  assertWithinMaxFileSize,
  deleteObjectBestEffort,
  headObjectAfterMultipartComplete,
  listAllParts,
  openStoredTarget,
  requireContentLength,
  resolveObjectAcl,
  runHook,
  runLifecycleHook,
  sendOrObjectNotFound,
} from "@/helpers";
import type { ResolvedDimahS3Config } from "@/types";
import { createS3Endpoint } from "@/api/create-s3-endpoint";

async function handleComplete(
  config: ResolvedDimahS3Config,
  input: typeof multipartCompleteBodySchema._output,
  request: Request,
): Promise<MultipartCompleteResponse> {
  const { route, key, bucket, stored } = await openStoredTarget(
    config,
    input,
    request,
    "multipart",
  );
  const uploadId = input.uploadId;
  const parts = [
    ...new Set(input.parts.map(({ partNumber }) => partNumber)),
  ].sort((a, b) => a - b);
  const partRefs = parts.map((partNumber) => ({ partNumber }));

  await runHook(route.upload.multipart.sessionGuard, {
    ...stored,
    uploadId,
    action: "complete",
  });
  await runHook(route.upload.confirmGuard, {
    ...stored,
    uploadId,
    parts: partRefs,
  });

  const listedParts = await listAllParts(route.client, {
    bucket,
    key,
    uploadId,
  });

  let assembledBytes = 0;
  const completeParts = parts.map((partNumber) => {
    const found = listedParts.find((p) => p.PartNumber === partNumber);
    if (!found?.ETag) {
      throw errors.multipartPartMissing(partNumber);
    }
    assembledBytes += found.Size ?? 0;
    return { PartNumber: partNumber, ETag: found.ETag };
  });

  try {
    assertWithinMaxFileSize(route.upload.maxFileSize, assembledBytes);
  } catch (err) {
    await abortMultipartBestEffort(route.client, bucket, key, uploadId);
    throw err;
  }

  const completeResult: CompleteMultipartUploadCommandOutput =
    await sendOrObjectNotFound(() =>
      route.client.send(
        new CompleteMultipartUploadCommand({
          Bucket: bucket,
          Key: key,
          UploadId: uploadId,
          MultipartUpload: { Parts: completeParts },
        }),
      ),
    );

  const head = await headObjectAfterMultipartComplete(
    route.client,
    bucket,
    key,
  );
  const contentLength = requireContentLength(head);
  const contentType = head.ContentType;
  const fileName = resolveStoredFileName(head.ContentDisposition, key);

  try {
    assertVerifiedConstraints(route.upload, {
      fileName,
      contentType,
      contentLength,
    });
  } catch (err) {
    await deleteObjectBestEffort(route.client, bucket, key);
    throw err;
  }

  const eTag = (head.ETag ?? completeResult.ETag ?? "").replace(/"/g, "");
  const metadata = head.Metadata ?? {};
  const versionId = head.VersionId;
  const lastModified = head.LastModified?.toISOString();

  const acl = config.resolveObjectAcl
    ? await resolveObjectAcl(route.client, bucket, key)
    : undefined;

  await runLifecycleHook(route.upload.onConfirmed, {
    ...stored,
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
    return handleComplete(ctx.context.config, ctx.body, ctx.context.request);
  },
);
