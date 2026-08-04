import { HeadObjectCommand } from "@aws-sdk/client-s3";
import type { UploadConfirmResponse } from "@dimah-s3/core";
import { parseFileName } from "@dimah-s3/core";
import { requireString } from "../errors";
import { resolveObjectAcl } from "../helpers";
import { runHook, runLifecycleHook } from "../internal-helpers";
import type { DimahS3Config } from "../types";

export type ConfirmInput = {
  key: string;
  bucket?: string;
};

export async function confirm(
  config: DimahS3Config,
  input: ConfirmInput,
  request: Request,
): Promise<UploadConfirmResponse> {
  const key = requireString(input.key, "key");
  const bucket = input.bucket?.trim() || config.defaultBucket;

  await runHook(config.upload?.confirmGuard, {
    request,
    key,
    bucket,
  });

  const head = await config.s3.send(
    new HeadObjectCommand({ Bucket: bucket, Key: key }),
  );

  const acl = config.resolveObjectAcl
    ? await resolveObjectAcl(config.s3, bucket, key)
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
