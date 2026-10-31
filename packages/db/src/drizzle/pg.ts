/**
 * Drizzle tables for @dimah-s3/db schema 2.0.0 on PostgreSQL. They match
 * `sql/pg.sql`.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  index,
  json,
  pgTable,
  text,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core";
import type { StorageObjectStatus } from "@/types/storage-object";
import { DIMAH_S3_SCHEMA_VERSION, runtimeDefaults } from "./shared";

function id() {
  return varchar("id", { length: 255 })
    .primaryKey()
    .$defaultFn(runtimeDefaults.id);
}

function timestampNow(name: string) {
  return timestamp(name)
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`)
    .$defaultFn(runtimeDefaults.now);
}

function byteCount(name: string) {
  return bigint(name, { mode: "number" });
}

/** The `storage_object` table: one row per tracked object. */
export const storageObject = pgTable(
  "storage_object",
  {
    id: id(),
    scope: text("scope").notNull(),
    bucket: text("bucket").notNull(),
    key: text("key").notNull(),
    route: text("route").notNull(),
    folder: text("folder"),
    filename: text("filename").notNull(),
    contentType: text("content_type"),
    size: byteCount("size"),
    declaredSize: byteCount("declared_size"),
    eTag: text("e_tag"),
    status: text("status").$type<StorageObjectStatus>().notNull(),
    s3Metadata: json("s3_metadata").$type<Record<string, string>>(),
    attributes: json("attributes"),
    acl: text("acl"),
    uploadId: text("upload_id"),
    uploadToken: text("upload_token"),
    expiresAt: timestamp("expires_at"),
    confirmedAt: timestamp("confirmed_at"),
    createdAt: timestampNow("created_at"),
    updatedAt: timestampNow("updated_at"),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => [
    unique("storage_object_bucket_key_uk").on(table.bucket, table.key),
    index("storage_object_scope_folder_idx").on(
      table.scope,
      table.status,
      table.folder,
      table.createdAt,
    ),
    index("storage_object_scope_updated_idx").on(
      table.scope,
      table.status,
      table.updatedAt,
    ),
    index("storage_object_scope_filename_idx").on(
      table.scope,
      table.status,
      table.filename,
    ),
    index("storage_object_scope_size_idx").on(
      table.scope,
      table.status,
      table.size,
    ),
    index("storage_object_status_expires_idx").on(
      table.status,
      table.expiresAt,
    ),
  ],
);

/** The `storage_folder` table: one row per folder, so empty folders list. */
export const storageFolder = pgTable(
  "storage_folder",
  {
    id: id(),
    scope: text("scope").notNull(),
    path: text("path").notNull(),
    parent: text("parent"),
    name: text("name").notNull(),
    createdAt: timestampNow("created_at"),
  },
  (table) => [
    unique("storage_folder_scope_path_uk").on(table.scope, table.path),
    index("storage_folder_scope_parent_idx").on(table.scope, table.parent),
  ],
);

/**
 * The FumaDB settings table. The Drizzle adapter reads the schema version
 * from the default of its `version` column, which is stored as `value`.
 */
export const dimahS3Settings = pgTable("private_dimah_s3_settings", {
  key: varchar("key", { length: 255 }).primaryKey(),
  version: text("value").notNull().default(DIMAH_S3_SCHEMA_VERSION),
});

/**
 * Every @dimah-s3/db table. Spread it into your Drizzle schema and keep its
 * keys, because the FumaDB Drizzle adapter finds tables by them:
 * `drizzle({ client, relations: defineRelations({ ...dimahS3Tables }) })` on
 * drizzle-orm 1.x, or `drizzle({ client, schema: { ...dimahS3Tables } })` on 0.x.
 */
export const dimahS3Tables = {
  storageObject,
  storageFolder,
  private_dimah_s3_settings: dimahS3Settings,
};
