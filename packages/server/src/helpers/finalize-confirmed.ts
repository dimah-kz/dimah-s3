import type { ConfirmedObjectResponse, S3ObjectAcl } from "@dimah-s3/core";
import { resolveStoredFileName } from "@dimah-s3/core";
import type { HeadObjectCommandOutput, S3Client } from "@aws-sdk/client-s3";
import { assertVerifiedConstraints } from "@/helpers/constraints";
import { deleteObjectBestEffort } from "@/helpers/best-effort";
import { requireContentLength } from "@/helpers/head-object";
import { runLifecycleHook } from "@/helpers/hooks";
import { assertStoredKey } from "@/helpers/resolve-target";
import {
  previousKeyFromMetadata,
  stripPreviousKeyMeta,
} from "@/helpers/previous-key";
import type {
  OpenedRoute,
  ResolvedDimahS3Config,
  StoredObjectContext,
  UploadOnConfirmedContext,
} from "@/types";

export type FinalizeConfirmedInput = {
  config: ResolvedDimahS3Config;
  route: OpenedRoute<"upload" | "multipart">;
  stored: StoredObjectContext;
  head: HeadObjectCommandOutput;
  uploadId?: string;
  /** ACL from the upload policy, not GetObjectAcl. */
  acl?: S3ObjectAcl;
};

/**
 * HeadObject constraints, `onConfirmed`, then compensating `DeleteObject`
 * (and `previousKey` cleanup) so a thrown lifecycle hook cannot leave an
 * orphan object.
 */
export async function finalizeConfirmedObject(
  client: S3Client,
  bucket: string,
  key: string,
  input: FinalizeConfirmedInput,
): Promise<ConfirmedObjectResponse> {
  const { config, route, stored, head, uploadId, acl } = input;
  const contentLength = requireContentLength(head);
  const fileName = resolveStoredFileName(head.ContentDisposition, key);
  const rawMetadata = head.Metadata ?? {};

  try {
    assertVerifiedConstraints(route.upload, {
      fileName,
      contentType: head.ContentType,
      contentLength,
    });
  } catch (err) {
    await deleteObjectBestEffort(client, bucket, key);
    throw err;
  }

  const metadata = stripPreviousKeyMeta(rawMetadata);
  const context: UploadOnConfirmedContext = {
    ...stored,
    contentType: head.ContentType,
    contentLength,
    eTag: head.ETag?.replace(/"/g, ""),
    metadata,
    acl,
    fileName,
    versionId: head.VersionId,
    lastModified: head.LastModified?.toISOString(),
    uploadId,
  };

  try {
    await runLifecycleHook(route.upload.onConfirmed, context, config);
  } catch (err) {
    await deleteObjectBestEffort(client, bucket, key);
    throw err;
  }

  const previousKey = previousKeyFromMetadata(rawMetadata);
  if (previousKey && previousKey !== key) {
    try {
      const safe = assertStoredKey(previousKey, route.keyPrefix);
      await deleteObjectBestEffort(client, bucket, safe);
    } catch {
      // Invalid previousKey — skip.
    }
  }

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
