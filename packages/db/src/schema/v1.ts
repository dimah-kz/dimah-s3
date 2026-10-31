import { column, idColumn, schema, table } from "fumadb/schema";

/**
 * Schema 1.0.0, kept so the FumaDB migrator can move a 1.x database to
 * 2.0.0 (`v2.ts`). Nothing queries it.
 *
 * The `metadata` column has the ORM name `s3Metadata`, the name it has in
 * 2.0.0, so the migrator renames the column (and SQLite's table rebuild
 * copies it) instead of dropping its data.
 */
const storageObject = table("storage_object", {
  id: idColumn("id", "varchar(255)").defaultTo$("auto"),
  scope: column("scope", "string"),
  bucket: column("bucket", "string"),
  key: column("key", "string"),
  route: column("route", "string"),
  contentType: column("content_type", "string").nullable(),
  size: column("size", "bigint").nullable(),
  eTag: column("e_tag", "string").nullable(),
  filename: column("filename", "string").nullable(),
  status: column("status", "string"),
  s3Metadata: column("metadata", "json").nullable(),
  acl: column("acl", "string").nullable(),
  uploadId: column("upload_id", "string").nullable(),
  declaredSize: column("declared_size", "bigint").nullable(),
  confirmedAt: column("confirmed_at", "timestamp").nullable(),
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
