import {
  AbortMultipartUploadCommand,
  HeadObjectCommand,
  type HeadObjectCommandOutput,
  type S3Client,
} from "@aws-sdk/client-s3";
import type { DimahS3Logger } from "@dimah-s3/server";
import {
  deleteObjectIfMatch,
  isAwsNotFound,
  readUploadMarker,
} from "@dimah-s3/server/plugins";
import {
  DEFAULT_STALE_LIMIT,
  type StorageObjectStore,
  uploadTokenOf,
} from "@/store/object-store";
import type { StorageObject } from "@/types/storage-object";

export type CreatePurgeOptions = {
  objects: Pick<
    StorageObjectStore<unknown>,
    | "findStale"
    | "claimStale"
    | "deletePurged"
    | "cancelUpload"
    | "discardUpload"
    | "pruneDeleted"
  >;
  /** S3 client of a route. `undefined` fails the row, which stays claimed. */
  client: (route: string) => S3Client | undefined;
  /** Where a row that fails to purge is reported. */
  logger: () => DimahS3Logger | undefined;
};

export type PurgeStaleOptions = {
  /** Most rows one run handles. @default 100 */
  limit?: number;
};

export type PruneDeletedOptions = {
  /** Soft-deleted rows deleted before this time are removed (a `Date` or epoch milliseconds). */
  olderThan: Date | number;
};

/** What one `purgeStale` run did. */
export type PurgeStaleResult = {
  /** Uploads cleaned up. */
  purged: number;
  /** Rows that failed. They stay claimed and are retried after the claim lapses. */
  failed: number;
  /** Rows that another run claimed, or that were confirmed or written again meanwhile. */
  skipped: number;
  /** True when the run hit `limit`, so more stale rows may be waiting. */
  more: boolean;
};

/** The cleanup jobs on `s3.db`. */
export type Purge = {
  /**
   * Cleans up uploads past their confirm deadline. It aborts the multipart
   * upload, and deletes the object only while it still carries the upload's
   * marker. A pending row is removed. An unconfirmed overwrite keeps the
   * active row and its object, unless the overwrite's object already
   * replaced it. A row confirmed meanwhile is kept. A row that fails stays
   * claimed, is logged, and is retried once the claim lapses, 15 minutes
   * later.
   */
  purgeStale: (options?: PurgeStaleOptions) => Promise<PurgeStaleResult>;
  /** Removes soft-deleted rows older than `olderThan`. */
  pruneDeleted: (options: PruneDeletedOptions) => Promise<{ pruned: number }>;
};

async function abortUpload(
  client: S3Client,
  row: StorageObject<unknown>,
  uploadId: string,
): Promise<void> {
  try {
    await client.send(
      new AbortMultipartUploadCommand({
        Bucket: row.bucket,
        Key: row.key,
        UploadId: uploadId,
      }),
    );
  } catch (error) {
    // Already aborted or completed.
    if (!isAwsNotFound(error)) throw error;
  }
}

async function headObject(
  client: S3Client,
  row: StorageObject<unknown>,
): Promise<HeadObjectCommandOutput | null> {
  try {
    return await client.send(
      new HeadObjectCommand({ Bucket: row.bucket, Key: row.key }),
    );
  } catch (error) {
    if (isAwsNotFound(error)) return null;
    throw error;
  }
}

/**
 * The row's key once purge is done with S3: `empty`, or `kept` when it may
 * hold an object that another upload wrote.
 */
type KeyState = "empty" | "kept";

/**
 * Deletes the object at the row's key while it is the one the row's upload
 * wrote: its upload marker matches, and `If-Match` on the HeadObject ETag
 * keeps an object written after the HeadObject.
 */
async function deleteUploadedObject(
  client: S3Client,
  row: StorageObject<unknown>,
): Promise<KeyState> {
  const head = await headObject(client, row);
  if (!head) return "empty";
  if (readUploadMarker(head.Metadata) !== uploadTokenOf(row)) return "kept";
  const deleted = await deleteObjectIfMatch(client, {
    bucket: row.bucket,
    key: row.key,
    eTag: head.ETag,
  });
  return deleted ? "empty" : "kept";
}

/** Creates the purge jobs. */
export function createPurge(options: CreatePurgeOptions): Purge {
  const { objects } = options;

  const purgeRow = async (row: StorageObject<unknown>) => {
    const client = options.client(row.route);
    if (!client) {
      // Dropping the row would leave its object in the bucket untracked.
      throw new Error(
        `No S3 client for route "${row.route}". Keep the route in dimahS3({ routes }) until its rows are purged.`,
      );
    }
    if (row.uploadId) await abortUpload(client, row, row.uploadId);
    // A completed multipart upload leaves an object too.
    const key = await deleteUploadedObject(client, row);
    if (row.status === "active" && row.uploadToken !== null) {
      // An unconfirmed overwrite: the row goes only with its object. The
      // claimed token matches the row only while no new upload took it.
      const upload = {
        bucket: row.bucket,
        key: row.key,
        uploadToken: row.uploadToken,
      };
      if (key === "empty") await objects.discardUpload(upload);
      else await objects.cancelUpload(upload);
      return;
    }
    await objects.deletePurged(row.id);
  };

  return {
    async purgeStale({ limit = DEFAULT_STALE_LIMIT } = {}) {
      const result: PurgeStaleResult = {
        purged: 0,
        failed: 0,
        skipped: 0,
        more: false,
      };
      const stale = await objects.findStale({ limit });
      result.more = stale.length >= limit;
      for (const candidate of stale) {
        const row = await objects.claimStale(candidate.id);
        if (!row) {
          result.skipped += 1;
          continue;
        }
        try {
          await purgeRow(row);
          result.purged += 1;
        } catch (error) {
          result.failed += 1;
          options
            .logger()
            ?.warn?.(
              `[dimah-s3/db] Could not purge ${row.bucket}/${row.key}; a run after its claim lapses retries it.`,
              error,
            );
        }
      }
      return result;
    },

    async pruneDeleted({ olderThan }) {
      return { pruned: await objects.pruneDeleted(new Date(olderThan)) };
    },
  };
}
