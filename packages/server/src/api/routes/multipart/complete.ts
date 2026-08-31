import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import {
  CompleteMultipartUploadCommand,
  type CompleteMultipartUploadCommandOutput,
} from "@aws-sdk/client-s3";
import {
  multipartCompleteBodySchema,
  parseFileName,
  S3_API_ROUTES,
  type MultipartCompleteResponse,
} from "@dimah-s3/core";
import { errors } from "@/errors";
import {
  assertVerifiedConstraints,
  getResolvedRoute,
  headObjectAfterMultipartComplete,
  listAllParts,
  requireContentLength,
  resolveObjectAcl,
  resolveStoredTarget,
  runHook,
  runLifecycleHook,
  sendOrObjectNotFound,
} from "@/helpers";
import type { ResolvedDimahS3Config } from "@/types";
import { assertFeatureEnabled } from "@/api/assert-feature-enabled";
import { createS3Endpoint } from "@/api/create-s3-endpoint";

async function handleComplete(
  config: ResolvedDimahS3Config,
  input: typeof multipartCompleteBodySchema._output,
  request: Request,
): Promise<MultipartCompleteResponse> {
  const route = getResolvedRoute(config, input.route);
  assertFeatureEnabled(route, "multipart");
  await runHook(route.guard, { request, route: route.name });

  const { key, bucket } = resolveStoredTarget(route, input.key);
  const uploadId = input.uploadId;
  const parts = input.parts
    .map(({ partNumber }) => partNumber)
    .sort((a, b) => a - b);
  const partRefs = parts.map((partNumber) => ({ partNumber }));

  await runHook(route.multipart?.completeGuard, {
    request,
    route: route.name,
    key,
    bucket,
    uploadId,
    parts: partRefs,
  });

  const listedParts = await listAllParts(route.client, {
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
  const fileName = parseFileName(head.ContentDisposition);

  try {
    assertVerifiedConstraints(route, {
      fileName,
      contentType,
      contentLength,
    });
  } catch (err) {
    try {
      await route.client.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: key }),
      );
    } catch {
      // Best-effort cleanup.
    }
    throw err;
  }

  const eTag = (head.ETag ?? completeResult.ETag ?? "").replace(/"/g, "");
  const metadata = head.Metadata ?? {};
  const versionId = head.VersionId;
  const lastModified = head.LastModified?.toISOString();

  const acl = config.resolveObjectAcl
    ? await resolveObjectAcl(route.client, bucket, key)
    : undefined;

  await runLifecycleHook(route.multipart?.onComplete, {
    request,
    route: route.name,
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
    return handleComplete(ctx.context.config, ctx.body, ctx.context.request);
  },
);
