-- @dimah-s3/db schema 1.0.0 → 2.0.0 for SQLite.
-- Back up the database first. SQLite cannot change a column in place, so
-- this rebuilds `storage_object`:
-- - `metadata` moves to `s3_metadata`; `attributes`, `folder`, and
--   `upload_token` start empty (`folder` NULL is the root).
-- - A missing `filename` becomes the last segment of the key.
-- - Sizes become INTEGER. 1.x stored them as blobs: an 8-byte big-endian
--   integer (Kysely adapter) or the decimal digits (Drizzle).
-- - Timestamps become epoch milliseconds. 1.x Drizzle tables stored seconds.

BEGIN;

UPDATE "storage_object" SET "size" = CASE
  WHEN length("size") = 8 AND substr(hex("size"), 1, 2) = '00' THEN (
    WITH RECURSIVE "digit" ("i", "n") AS (
      SELECT 1, 0
      UNION ALL
      SELECT "i" + 1, "n" * 16 + instr('0123456789ABCDEF', substr(hex("storage_object"."size"), "i", 1)) - 1
      FROM "digit" WHERE "i" <= 16
    )
    SELECT "n" FROM "digit" WHERE "i" = 17
  )
  ELSE CAST(CAST("size" AS TEXT) AS INTEGER)
END
WHERE typeof("size") = 'blob';

UPDATE "storage_object" SET "declared_size" = CASE
  WHEN length("declared_size") = 8 AND substr(hex("declared_size"), 1, 2) = '00' THEN (
    WITH RECURSIVE "digit" ("i", "n") AS (
      SELECT 1, 0
      UNION ALL
      SELECT "i" + 1, "n" * 16 + instr('0123456789ABCDEF', substr(hex("storage_object"."declared_size"), "i", 1)) - 1
      FROM "digit" WHERE "i" <= 16
    )
    SELECT "n" FROM "digit" WHERE "i" = 17
  )
  ELSE CAST(CAST("declared_size" AS TEXT) AS INTEGER)
END
WHERE typeof("declared_size") = 'blob';

-- Seconds (anything before 1973 as milliseconds) and text dates become milliseconds.
UPDATE "storage_object" SET
  "expires_at" = CASE WHEN typeof("expires_at") = 'text' THEN CAST(strftime('%s', "expires_at") AS INTEGER) * 1000 WHEN "expires_at" < 100000000000 THEN "expires_at" * 1000 ELSE "expires_at" END,
  "confirmed_at" = CASE WHEN typeof("confirmed_at") = 'text' THEN CAST(strftime('%s', "confirmed_at") AS INTEGER) * 1000 WHEN "confirmed_at" < 100000000000 THEN "confirmed_at" * 1000 ELSE "confirmed_at" END,
  "created_at" = CASE WHEN typeof("created_at") = 'text' THEN CAST(strftime('%s', "created_at") AS INTEGER) * 1000 WHEN "created_at" < 100000000000 THEN "created_at" * 1000 ELSE "created_at" END,
  "updated_at" = CASE WHEN typeof("updated_at") = 'text' THEN CAST(strftime('%s', "updated_at") AS INTEGER) * 1000 WHEN "updated_at" < 100000000000 THEN "updated_at" * 1000 ELSE "updated_at" END,
  "deleted_at" = CASE WHEN typeof("deleted_at") = 'text' THEN CAST(strftime('%s', "deleted_at") AS INTEGER) * 1000 WHEN "deleted_at" < 100000000000 THEN "deleted_at" * 1000 ELSE "deleted_at" END;

CREATE TABLE "storage_object_v2" (
  "id" text PRIMARY KEY NOT NULL,
  "scope" text NOT NULL,
  "bucket" text NOT NULL,
  "key" text NOT NULL,
  "route" text NOT NULL,
  "folder" text,
  "filename" text NOT NULL,
  "content_type" text,
  "size" integer,
  "declared_size" integer,
  "e_tag" text,
  "status" text NOT NULL,
  "s3_metadata" text,
  "attributes" text,
  "acl" text,
  "upload_id" text,
  "upload_token" text,
  "expires_at" integer,
  "confirmed_at" integer,
  "created_at" integer NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  "updated_at" integer NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  "deleted_at" integer
);

INSERT INTO "storage_object_v2" (
  "id", "scope", "bucket", "key", "route", "folder", "filename",
  "content_type", "size", "declared_size", "e_tag", "status", "s3_metadata",
  "attributes", "acl", "upload_id", "upload_token", "expires_at",
  "confirmed_at", "created_at", "updated_at", "deleted_at"
)
SELECT
  "id", "scope", "bucket", "key", "route", NULL,
  COALESCE(
    "filename",
    NULLIF(substr("key", length(rtrim("key", replace("key", '/', ''))) + 1), ''),
    "key"
  ),
  "content_type", "size", "declared_size", "e_tag", "status",
  CASE WHEN typeof("metadata") = 'blob' THEN CAST("metadata" AS TEXT) ELSE "metadata" END,
  NULL, "acl", "upload_id", NULL, "expires_at",
  "confirmed_at", "created_at", "updated_at", "deleted_at"
FROM "storage_object";

DROP TABLE "storage_object";
ALTER TABLE "storage_object_v2" RENAME TO "storage_object";

CREATE UNIQUE INDEX "storage_object_bucket_key_uk" ON "storage_object" ("bucket", "key");
CREATE INDEX "storage_object_scope_folder_idx" ON "storage_object" ("scope", "status", "folder", "created_at");
CREATE INDEX "storage_object_scope_updated_idx" ON "storage_object" ("scope", "status", "updated_at");
CREATE INDEX "storage_object_scope_filename_idx" ON "storage_object" ("scope", "status", "filename");
CREATE INDEX "storage_object_scope_size_idx" ON "storage_object" ("scope", "status", "size");
CREATE INDEX "storage_object_status_expires_idx" ON "storage_object" ("status", "expires_at");

CREATE TABLE "storage_folder" (
  "id" text PRIMARY KEY NOT NULL,
  "scope" text NOT NULL,
  "path" text NOT NULL,
  "parent" text,
  "name" text NOT NULL,
  "created_at" integer NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE UNIQUE INDEX "storage_folder_scope_path_uk" ON "storage_folder" ("scope", "path");
CREATE INDEX "storage_folder_scope_parent_idx" ON "storage_folder" ("scope", "parent");

COMMIT;

-- Kysely and Prisma read the version from this table. A Drizzle setup reads
-- it from the table definition instead: skip this statement there.
UPDATE "private_dimah_s3_settings" SET "value" = '2.0.0' WHERE "key" = 'version';
