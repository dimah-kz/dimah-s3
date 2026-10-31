-- @dimah-s3/db schema 1.0.0 → 2.0.0 for PostgreSQL.
-- Back up the database first.
-- - `metadata` moves to `s3_metadata`; `attributes`, `folder`, and
--   `upload_token` start empty (`folder` NULL is the root).
-- - A missing `filename` becomes the last segment of the key.
-- - The 1.x recommended indexes give way to the 2.0.0 indexes.

BEGIN;

ALTER TABLE "storage_object" RENAME COLUMN "metadata" TO "s3_metadata";
ALTER TABLE "storage_object"
  ADD COLUMN "folder" text,
  ADD COLUMN "attributes" json,
  ADD COLUMN "upload_token" text;

UPDATE "storage_object"
SET "filename" = COALESCE(NULLIF(substring("key" from '[^/]*$'), ''), "key")
WHERE "filename" IS NULL;
ALTER TABLE "storage_object" ALTER COLUMN "filename" SET NOT NULL;

DROP INDEX IF EXISTS "storage_object_scope_status_created_idx";
DROP INDEX IF EXISTS "storage_object_scope_route_idx";
DROP INDEX IF EXISTS "storage_object_status_created_idx";

CREATE INDEX IF NOT EXISTS "storage_object_scope_folder_idx" ON "storage_object" ("scope", "status", "folder", "created_at");
CREATE INDEX IF NOT EXISTS "storage_object_scope_updated_idx" ON "storage_object" ("scope", "status", "updated_at");
CREATE INDEX IF NOT EXISTS "storage_object_scope_filename_idx" ON "storage_object" ("scope", "status", "filename");
CREATE INDEX IF NOT EXISTS "storage_object_scope_size_idx" ON "storage_object" ("scope", "status", "size");
CREATE INDEX IF NOT EXISTS "storage_object_status_expires_idx" ON "storage_object" ("status", "expires_at");

CREATE TABLE "storage_folder" (
  "id" varchar(255) PRIMARY KEY NOT NULL,
  "scope" text NOT NULL,
  "path" text NOT NULL,
  "parent" text,
  "name" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "storage_folder_scope_path_uk" UNIQUE ("scope", "path")
);

CREATE INDEX "storage_folder_scope_parent_idx" ON "storage_folder" ("scope", "parent");

COMMIT;

-- Kysely and Prisma read the version from this table. A Drizzle setup reads
-- it from the table definition instead: skip this statement there.
UPDATE "private_dimah_s3_settings" SET "value" = '2.0.0' WHERE "key" = 'version';
