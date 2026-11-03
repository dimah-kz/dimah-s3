-- @dimah-s3/db schema 2.1.0 for SQLite.
-- Timestamps are epoch milliseconds. Sizes are INTEGER.

CREATE TABLE "storage_object" (
  "id" text PRIMARY KEY NOT NULL,
  "scope" text NOT NULL,
  "bucket" text NOT NULL,
  "key" text NOT NULL,
  "route" text NOT NULL,
  "folder_id" text,
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

CREATE UNIQUE INDEX "storage_object_bucket_key_uk" ON "storage_object" ("bucket", "key");
CREATE INDEX "storage_object_scope_folder_idx" ON "storage_object" ("scope", "status", "folder_id", "created_at");
CREATE INDEX "storage_object_scope_updated_idx" ON "storage_object" ("scope", "status", "updated_at");
CREATE INDEX "storage_object_scope_filename_idx" ON "storage_object" ("scope", "status", "filename");
CREATE INDEX "storage_object_scope_size_idx" ON "storage_object" ("scope", "status", "size");
CREATE INDEX "storage_object_status_expires_idx" ON "storage_object" ("status", "expires_at");

CREATE TABLE "storage_folder" (
  "id" text PRIMARY KEY NOT NULL,
  "scope" text NOT NULL,
  "parent_id" text NOT NULL DEFAULT '',
  "name" text NOT NULL,
  "path" text NOT NULL,
  "created_at" integer NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  "updated_at" integer NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE UNIQUE INDEX "storage_folder_scope_path_uk" ON "storage_folder" ("scope", "path");
CREATE UNIQUE INDEX "storage_folder_scope_parent_name_uk" ON "storage_folder" ("scope", "parent_id", "name");

-- Schema version for the Kysely and Prisma adapters.
CREATE TABLE "private_dimah_s3_settings" (
  "key" text PRIMARY KEY NOT NULL,
  "value" text NOT NULL DEFAULT '2.1.0'
);

INSERT INTO "private_dimah_s3_settings" ("key", "value") VALUES ('version', '2.1.0');
