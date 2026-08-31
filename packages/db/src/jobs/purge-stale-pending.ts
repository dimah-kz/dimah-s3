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
   * Rows with `expiresAt` are purged when that timestamp has passed,
   * independent of this value.
   * @default 86_400_000 (24h)
   */
  olderThanMs?: number;
  /**
   * Runs before rows are deleted — abort multipart uploads here using each
   * object's `uploadId` with your own S3 client (this package has no AWS
   * SDK dependency). Throwing keeps all rows for the next run.
   */
  onBeforePurge?: (objects: StorageObject[]) => Promise<void> | void;
};

export type PurgeStalePendingResult = {
  purged: StorageObject[];
};

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

  await options.onBeforePurge?.(stale);
  await store.deleteByIds(stale.map((object) => object.id));

  return { purged: stale };
}
