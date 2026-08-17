import { HeadObjectCommand } from "@aws-sdk/client-s3";
import {
  confirmBodySchema,
  parseFileName,
  S3_API_ROUTES,
  type UploadConfirmResponse,
} from "@dimah-s3/core";
import { resolveObjectAcl } from "../../helpers";
import { runHook, runLifecycleHook } from "../../internal-helpers";
import type { ResolvedDimahS3Config } from "../../types";
import { resolveRequestTarget } from "../../helpers/resolve-target";
import { assertFeatureEnabled } from "../assert-feature-enabled";
import { createS3Endpoint } from "../create-s3-endpoint";

async function handleConfirm(
  config: ResolvedDimahS3Config,
  input: typeof confirmBodySchema._output,
  request: Request,
): Promise<UploadConfirmResponse> {
  const { key, bucket } = await resolveRequestTarget(config, config.upload, {
    request,
    key: input.key,
    bucket: input.bucket,
  });

  await runHook(config.upload?.confirmGuard, {
    request,
    key,
    bucket,
  });

  const head = await config.client.send(
    new HeadObjectCommand({ Bucket: bucket, Key: key }),
  );

  const acl = config.resolveObjectAcl
    ? await resolveObjectAcl(config.client, bucket, key)
    : undefined;
  const fileName = parseFileName(head.ContentDisposition);

  const context = {
    request,
    key,
    bucket,
    contentType: head.ContentType,
    contentLength: head.ContentLength ?? 0,
    eTag: head.ETag?.replace(/"/g, ""),
    metadata: head.Metadata,
    acl,
    fileName,
    versionId: head.VersionId,
    lastModified: head.LastModified?.toISOString(),
  };

  await runLifecycleHook(config.upload?.onConfirmed, context);

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
    assertFeatureEnabled(ctx.context.config, "upload");
    return handleConfirm(ctx.context.config, ctx.body, ctx.context.request);
  },
);
