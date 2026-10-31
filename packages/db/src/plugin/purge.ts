import {
  AbortMultipartUploadCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  type HeadObjectCommandOutput,
  type S3Client,
} from "@aws-sdk/client-s3";
import type { DimahS3Logger } from "@dimah-s3/server";
import {
  DEFAULT_STALE_LIMIT,
  type StorageObjectStore,
  uploadTokenOf,
} from "@/store/object-store";
import type { StorageObject } from "@/types/storage-object";

/**
 * S3 user-metadata key of the server's upload marker. Its value is the
 * token of the upload that wrote the object.
 */
const UPLOAD_MARKER_META = "dimah-upload";

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
  /** S3 client of a route. `undefined` leaves S3 untouched for its rows. */
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

/** The cleanup jobs on `s3.db`. */
export type Purge = {
  /**
   * Cleans up uploads past their confirm deadline. It aborts the multipart
   * upload, and deletes the object only while it still carries the upload's
   * marker. A pending row is removed. An unconfirmed overwrite keeps the
   * active row and its object, unless the overwrite's object already
   * replaced it. A row confirmed meanwhile is kept. A row that fails stays
   * claimed and is retried once the claim lapses, 15 minutes later.
   * `purged` counts the uploads cleaned up.
   */
  purgeStale: (options?: PurgeStaleOptions) => Promise<{ purged: number }>;
  /** Removes soft-deleted rows older than `olderThan`. */
  pruneDeleted: (options: PruneDeletedOptions) => Promise<{ pruned: number }>;
};

type AwsError = { name?: string; $metadata?: { httpStatusCode?: number } };

function awsStatus(error: unknown): number | undefined {
  return (error as AwsError | undefined)?.$metadata?.httpStatusCode;
}

function isNotFound(error: unknown): boolean {
  const name = (error as AwsError | undefined)?.name;
  return (
    name === "NotFound" ||
    name === "NoSuchKey" ||
    name === "NoSuchUpload" ||
    awsStatus(error) === 404
  );
}

function isNotImplemented(error: unknown): boolean {
  return (
    (error as AwsError | undefined)?.name === "NotImplemented" ||
    awsStatus(error) === 501
  );
}

function isPreconditionFailed(error: unknown): boolean {
  return (
    (error as AwsError | undefined)?.name === "PreconditionFailed" ||
    awsStatus(error) === 412
  );
}

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
    if (!isNotFound(error)) throw error;
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
    if (isNotFound(error)) return null;
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
 * wrote. `If-Match` guards against a write after HeadObject; a provider that
 * does not implement it gets a plain delete.
 */
async function deleteUploadedObject(
  client: S3Client,
  row: StorageObject<unknown>,
): Promise<KeyState> {
  const head = await headObject(client, row);
  if (!head) return "empty";
  if (head.Metadata?.[UPLOAD_MARKER_META] !== uploadTokenOf(row)) {
    return "kept";
  }
  const input = { Bucket: row.bucket, Key: row.key };
  try {
    await client.send(
      new DeleteObjectCommand({ ...input, IfMatch: head.ETag }),
    );
  } catch (error) {
    if (isPreconditionFailed(error)) return "kept";
    if (!isNotImplemented(error)) throw error;
    await client.send(new DeleteObjectCommand(input));
  }
  return "empty";
}

/** Creates the purge jobs. */
export function createPurge(options: CreatePurgeOptions): Purge {
  const { objects } = options;

  const purgeRow = async (row: StorageObject<unknown>) => {
    const client = options.client(row.route);
    let key: KeyState = "kept";
    if (client) {
      if (row.uploadId) await abortUpload(client, row, row.uploadId);
      // A completed multipart upload leaves an object too.
      key = await deleteUploadedObject(client, row);
    }
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
      let purged = 0;
      for (const stale of await objects.findStale({ limit })) {
        const row = await objects.claimStale(stale.id);
        if (!row) continue;
        try {
          await purgeRow(row);
          purged += 1;
        } catch (error) {
          options
            .logger()
            ?.warn?.(
              `[dimah-s3/db] Could not purge ${row.bucket}/${row.key}; a run after its claim lapses retries it.`,
              error,
            );
        }
      }
      return { purged };
    },

    async pruneDeleted({ olderThan }) {
      return { pruned: await objects.pruneDeleted(new Date(olderThan)) };
    },
  };
}
