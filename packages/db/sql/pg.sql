-- @dimah-s3/db schema 2.0.0 for PostgreSQL.

CREATE TABLE "storage_object" (
  "id" varchar(255) PRIMARY KEY NOT NULL,
  "scope" text NOT NULL,
  "bucket" text NOT NULL,
  "key" text NOT NULL,
  "route" text NOT NULL,
  "folder" text,
  "filename" text NOT NULL,
  "content_type" text,
  "size" bigint,
  "declared_size" bigint,
  "e_tag" text,
  "status" text NOT NULL,
  "s3_metadata" json,
  "attributes" json,
  "acl" text,
  "upload_id" text,
  "upload_token" text,
  "expires_at" timestamp,
  "confirmed_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" timestamp,
  CONSTRAINT "storage_object_bucket_key_uk" UNIQUE ("bucket", "key")
);

CREATE INDEX "storage_object_scope_folder_idx" ON "storage_object" ("scope", "status", "folder", "created_at");
CREATE INDEX "storage_object_scope_updated_idx" ON "storage_object" ("scope", "status", "updated_at");
CREATE INDEX "storage_object_scope_filename_idx" ON "storage_object" ("scope", "status", "filename");
CREATE INDEX "storage_object_scope_size_idx" ON "storage_object" ("scope", "status", "size");
CREATE INDEX "storage_object_status_expires_idx" ON "storage_object" ("status", "expires_at");

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

-- Schema version for the Kysely and Prisma adapters.
CREATE TABLE "private_dimah_s3_settings" (
  "key" varchar(255) PRIMARY KEY NOT NULL,
  "value" text NOT NULL DEFAULT '2.0.0'
);

INSERT INTO "private_dimah_s3_settings" ("key", "value") VALUES ('version', '2.0.0');
