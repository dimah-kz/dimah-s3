/** Lifecycle status of a tracked object. */
export type StorageObjectStatus = "pending" | "active" | "deleted";

/**
 * App-facing record for a `storage_object` row.
 * Sizes are normalized from bigint to number (safe — S3 caps objects at 5 TB).
 */
export type StorageObject = {
  id: string;
  /** Owner, e.g. `user:123` or `org:acme`. */
  scope: string;
  bucket: string;
  key: string;
  contentType: string | null;
  /** Verified size in bytes (set on confirm). */
  size: number | null;
  eTag: string | null;
  filename: string | null;
  status: StorageObjectStatus;
  /** App-specific labels, visibility, publicUrl, etc. */
  metadata: Record<string, unknown> | null;
  acl: string | null;
  /** Multipart upload ID while status = pending. */
  uploadId: string | null;
  /** Client-declared size before confirm (quota reservation). */
  declaredSize: number | null;
  confirmedAt: Date | null;
  /** Pending TTL or temporary object expiry. */
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

/**
 * Resolves the owning scope for a request (e.g. from a session cookie).
 * Return `null` to reject the request as unauthenticated (401).
 */
export type ScopeResolver = (
  request: Request,
) => string | null | Promise<string | null>;

/**
 * Browser-facing object row from `GET plugins/db/objects`.
 * Deliberately narrower than {@link StorageObject} — omits server-only fields.
 */
export type DbClientObject = {
  id: string;
  bucket: string;
  key: string;
  filename: string | null;
  contentType: string | null;
  size: number | null;
  declaredSize: number | null;
  status: StorageObjectStatus;
  /** ISO-8601 timestamp. */
  createdAt: string;
};

export type DbClientListResponse = {
  /** Scope resolved on the server via `resolveScope` (not a client input). */
  scope: string;
  usage: { totalBytes: number; objectCount: number };
  objects: DbClientObject[];
};

/**
 * Query params for browser `api.db.listObjects`.
 * Scope is not accepted — the server derives it from `resolveScope` on the request.
 */
export type DbClientListInput = {
  status?: StorageObjectStatus;
  limit?: number;
  offset?: number;
};
