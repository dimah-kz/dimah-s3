import {
  AbortMultipartUploadCommand,
  DeleteObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { resolveStore } from "@/hooks/create-object-access-guard";
import type {
  DimahS3DbClient,
  StorageObjectStore,
} from "@/store/storage-object-store";
import type { StorageObject } from "@/types/storage-object";

const DEFAULT_OLDER_THAN_MS = 24 * 60 * 60 * 1000;

export type PurgeStalePendingOptions = {
  /** FumaDB client (`DimahS3DB.client(adapter)`) or a prebuilt store. */
  client: DimahS3DbClient | StorageObjectStore;
  /**
   * Fallback age for pending rows that have no `expiresAt`.
   * @default 86_400_000 (24h)
   */
  olderThanMs?: number;
  /**
   * When set, abort in-progress multipart uploads and `DeleteObject` for
   * each stale pending key before rows are removed.
   */
  s3?: S3Client;
  /**
   * Runs before rows are deleted. Throwing keeps all rows for the next run.
   * Prefer `s3` unless you need a custom cleanup.
   */
  onBeforePurge?: (objects: StorageObject[]) => Promise<void> | void;
};

export type PurgeStalePendingResult = {
  purged: StorageObject[];
};

async function abortAndDelete(
  s3: S3Client,
  objects: StorageObject[],
): Promise<void> {
  for (const object of objects) {
    if (object.uploadId) {
      try {
        await s3.send(
          new AbortMultipartUploadCommand({
            Bucket: object.bucket,
            Key: object.key,
            UploadId: object.uploadId,
          }),
        );
      } catch {
        // Best-effort.
      }
    }
    try {
      await s3.send(
        new DeleteObjectCommand({
          Bucket: object.bucket,
          Key: object.key,
        }),
      );
    } catch {
      // Best-effort.
    }
  }
}

/**
 * Delete stale `pending` rows — uploads that were presigned but never
 * confirmed. Run it on a schedule (cron, queue worker, route handler).
 */
export async function purgeStalePendingObjects(
  options: PurgeStalePendingOptions,
): Promise<PurgeStalePendingResult> {
  const store = resolveStore(options.client);
  const olderThan = new Date(
    Date.now() - (options.olderThanMs ?? DEFAULT_OLDER_THAN_MS),
  );

  const stale = await store.findStalePending({ olderThan });
  if (stale.length === 0) return { purged: [] };

  if (options.s3) await abortAndDelete(options.s3, stale);
  await options.onBeforePurge?.(stale);
  await store.deleteByIds(stale.map((object) => object.id));

  return { purged: stale };
}
