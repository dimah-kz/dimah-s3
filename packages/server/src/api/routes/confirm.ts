import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import {
  confirmBodySchema,
  parseFileName,
  S3_API_ROUTES,
  type UploadConfirmResponse,
} from "@dimah-s3/core";
import {
  assertVerifiedConstraints,
  getResolvedRoute,
  headObjectOrNotFound,
  requireContentLength,
  resolveObjectAcl,
  resolveStoredTarget,
  runHook,
  runLifecycleHook,
} from "@/helpers";
import type { ResolvedDimahS3Config } from "@/types";
import { assertFeatureEnabled } from "@/api/assert-feature-enabled";
import { createS3Endpoint } from "@/api/create-s3-endpoint";

async function deleteBestEffort(
  config: ResolvedDimahS3Config,
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
  const route = getResolvedRoute(config, input.route);
  assertFeatureEnabled(route, "upload");
  await runHook(route.guard, { request, route: route.name });

  const { key, bucket } = resolveStoredTarget(route, input.key);

  await runHook(route.upload?.confirmGuard, {
    request,
    route: route.name,
    key,
    bucket,
  });

  const head = await headObjectOrNotFound(route.client, bucket, key);
  const contentLength = requireContentLength(head);
  const fileName = parseFileName(head.ContentDisposition);

  try {
    assertVerifiedConstraints(route, {
      fileName,
      contentType: head.ContentType,
      contentLength,
    });
  } catch (err) {
    await deleteBestEffort(config, bucket, key, route.client);
    throw err;
  }

  const acl = config.resolveObjectAcl
    ? await resolveObjectAcl(route.client, bucket, key)
    : undefined;

  const context = {
    request,
    route: route.name,
    key,
    bucket,
    contentType: head.ContentType,
    contentLength,
    eTag: head.ETag?.replace(/"/g, ""),
    metadata: head.Metadata,
    acl,
    fileName,
    versionId: head.VersionId,
    lastModified: head.LastModified?.toISOString(),
  };

  await runLifecycleHook(route.upload?.onConfirmed, context);

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
