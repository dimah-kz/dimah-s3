/**
 * Lifecycle status of a tracked object.
 * - `pending`: presigned or started, not confirmed yet
 * - `active`: confirmed with HeadObject
 * - `deleted`: soft-deleted
 * - `purging`: a stale pending row that purge has claimed
 */
export type StorageObjectStatus = "pending" | "active" | "deleted" | "purging";

/**
 * A `storage_object` row as the stores return it. Sizes are numbers (S3
 * caps an object at 5 TiB, well inside the safe integer range).
 */
export type StorageObject<TAttributes = never> = {
  id: string;
  /** Owner, for example `user:123` or `org:acme`. */
  scope: string;
  bucket: string;
  key: string;
  /** Named dimah-s3 route that created the object. */
  route: string;
  /** Logical folder path. `null` is the root. */
  folder: string | null;
  filename: string;
  contentType: string | null;
  /** Verified size in bytes, set on confirm. */
  size: number | null;
  /** Size the client declared before confirm. Quota counts it while pending. */
  declaredSize: number | null;
  eTag: string | null;
  status: StorageObjectStatus;
  /** S3 user metadata of the verified object. */
  s3Metadata: Record<string, string> | null;
  /** App attributes, validated by the plugin's `attributes.schema`. */
  attributes: TAttributes | null;
  acl: string | null;
  /** Multipart upload ID while the row is pending. */
  uploadId: string | null;
  /** Token of the upload ticket that wrote the row. */
  uploadToken: string | null;
  /** Confirm deadline of a pending row (the upload ticket's expiry). */
  expiresAt: Date | null;
  confirmedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

/** A `storage_folder` row. A folder exists once per scope and path. */
export type StorageFolder = {
  id: string;
  scope: string;
  /** Full folder path. */
  path: string;
  /** Path of the containing folder. `null` is the root. */
  parent: string | null;
  /** Last segment of `path`. */
  name: string;
  createdAt: Date;
};
