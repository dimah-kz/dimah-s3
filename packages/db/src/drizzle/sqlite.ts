/**
 * Drizzle tables for @dimah-s3/db schema 2.0.0 on SQLite. They match
 * `sql/sqlite.sql`: timestamps are epoch milliseconds and sizes are integers.
 */
import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import type { StorageObjectStatus } from "@/types/storage-object";
import { DIMAH_S3_SCHEMA_VERSION, runtimeDefaults } from "./shared";

function id() {
  return text("id").primaryKey().$defaultFn(runtimeDefaults.id);
}

function timestamp(name: string) {
  return integer(name, { mode: "timestamp_ms" });
}

function timestampNow(name: string) {
  return timestamp(name)
    .notNull()
    .default(sql`(strftime('%s', 'now') * 1000)`)
    .$defaultFn(runtimeDefaults.now);
}

function byteCount(name: string) {
  return integer(name, { mode: "number" });
}

/** The `storage_object` table: one row per tracked object. */
export const storageObject = sqliteTable(
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
    s3Metadata: text("s3_metadata", { mode: "json" }).$type<
      Record<string, string>
    >(),
    attributes: text("attributes", { mode: "json" }),
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
    uniqueIndex("storage_object_bucket_key_uk").on(table.bucket, table.key),
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
export const storageFolder = sqliteTable(
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
    uniqueIndex("storage_folder_scope_path_uk").on(table.scope, table.path),
    index("storage_folder_scope_parent_idx").on(table.scope, table.parent),
  ],
);

/**
 * The FumaDB settings table. The Drizzle adapter reads the schema version
 * from the default of its `version` column, which is stored as `value`.
 */
export const dimahS3Settings = sqliteTable("private_dimah_s3_settings", {
  key: text("key").primaryKey(),
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
