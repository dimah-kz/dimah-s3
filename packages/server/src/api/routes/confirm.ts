import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import {
  confirmBodySchema,
  parseFileName,
  S3_API_ROUTES,
  type UploadConfirmResponse,
} from "@dimah-s3/core";
import {
  assertVerifiedConstraints,
  headObjectOrNotFound,
  openStoredTarget,
  requireContentLength,
  resolveObjectAcl,
  runHook,
  runLifecycleHook,
} from "@/helpers";
import type { ResolvedDimahS3Config } from "@/types";
import { createS3Endpoint } from "@/api/create-s3-endpoint";

async function deleteBestEffort(
  bucket: string,
  key: string,
  client: ResolvedDimahS3Config["routes"][string]["client"],
) {
  try {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch {
    // Best-effort cleanup after a failed constraint check.
  }
}

async function handleConfirm(
  config: ResolvedDimahS3Config,
  input: typeof confirmBodySchema._output,
  request: Request,
): Promise<UploadConfirmResponse> {
  const { route, key, bucket, stored } = await openStoredTarget(
    config,
    input,
    request,
    "upload",
  );

  await runHook(route.upload.confirmGuard, stored);

  const head = await headObjectOrNotFound(route.client, bucket, key);
  const contentLength = requireContentLength(head);
  const fileName = parseFileName(head.ContentDisposition);

  try {
    assertVerifiedConstraints(route.upload, {
      fileName,
      contentType: head.ContentType,
      contentLength,
    });
  } catch (err) {
    await deleteBestEffort(bucket, key, route.client);
    throw err;
  }

  const acl = config.resolveObjectAcl
    ? await resolveObjectAcl(route.client, bucket, key)
    : undefined;

  const context = {
    ...stored,
    contentType: head.ContentType,
    contentLength,
    eTag: head.ETag?.replace(/"/g, ""),
    metadata: head.Metadata,
    acl,
    fileName,
    versionId: head.VersionId,
    lastModified: head.LastModified?.toISOString(),
  };

  await runLifecycleHook(route.upload.onConfirmed, context);

  return {
    key,
    bucket,
    contentType: context.contentType,
    contentLength: context.contentLength,
    eTag: context.eTag,
    metadata: context.metadata ?? {},
    acl,
    fileName,
    versionId: context.versionId,
    lastModified: context.lastModified,
  };
}

export const confirm = createS3Endpoint(
  S3_API_ROUTES.uploadConfirm,
  { method: "POST", body: confirmBodySchema },
  async (ctx) => {
    return handleConfirm(ctx.context.config, ctx.body, ctx.context.request);
  },
);
