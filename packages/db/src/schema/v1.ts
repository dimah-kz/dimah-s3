import { column, idColumn, schema, table } from "fumadb/schema";

/**
 * Single-table object lifecycle:
 * pending (presign) → active (HeadObject confirmed) → deleted (soft)
 *
 * Cron: delete stale pending rows (AbortMultipartUpload if uploadId set).
 * Ownership is expressed via `scope` (e.g. `user:…` / `org:…`).
 *
 * FumaDB only emits the `(bucket, key)` unique constraint. Secondary indexes
 * for listByScope / getScopeUsage / findStalePending are consumer-side after
 * CLI generate — see `./examples/` (Drizzle + Prisma) and README
 * "Recommended indexes".
 */
const storageObject = table("storage_object", {
  id: idColumn("id", "varchar(255)").defaultTo$("auto"),
  scope: column("scope", "string"),
  bucket: column("bucket", "string"),
  key: column("key", "string"),
  contentType: column("content_type", "string").nullable(),
  /** Verified size from HeadObject after confirm. */
  size: column("size", "bigint").nullable(),
  eTag: column("e_tag", "string").nullable(),
  filename: column("filename", "string").nullable(),
  status: column("status", "string"),
  /** App-specific labels, visibility, publicUrl, etc. */
  metadata: column("metadata", "json").nullable(),
  acl: column("acl", "string").nullable(),
  /** Multipart upload ID while status = pending. */
  uploadId: column("upload_id", "string").nullable(),
  /** Client-declared size before confirm (quota reservation). */
  declaredSize: column("declared_size", "bigint").nullable(),
  confirmedAt: column("confirmed_at", "timestamp").nullable(),
  /** Pending TTL or temporary object expiry. */
  expiresAt: column("expires_at", "timestamp").nullable(),
  createdAt: column("created_at", "timestamp").defaultTo$("now"),
  updatedAt: column("updated_at", "timestamp").defaultTo$("now"),
  deletedAt: column("deleted_at", "timestamp").nullable(),
}).unique("storage_object_bucket_key_uk", ["bucket", "key"]);

export const v1 = schema({
  version: "1.0.0",
  tables: {
    storageObject,
  },
});

export type { StorageObjectStatus } from "@/types/storage-object";
