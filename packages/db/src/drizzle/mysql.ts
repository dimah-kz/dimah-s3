/**
 * Drizzle tables for @dimah-s3/db schema 2.0.0 on MySQL 8. They match the
 * columns and indexes of `sql/mysql.sql`, including the prefix indexes on
 * `key`, `folder`, `path` and `parent`.
 *
 * Drizzle cannot set a collation on every supported version, so these tables
 * use the database default. `sql/mysql.sql` compares keys, folders and scopes
 * byte for byte (`utf8mb4_bin`) and file names case-insensitively. Create the
 * tables from that file, or give the database those collations.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  datetime,
  index,
  json,
  mysqlTable,
  text,
  uniqueIndex,
  varchar,
  type MySqlColumn,
} from "drizzle-orm/mysql-core";
import type { StorageObjectStatus } from "@/types/storage-object";
import { DIMAH_S3_SCHEMA_VERSION, runtimeDefaults } from "./shared";

function id() {
  return varchar("id", { length: 255 })
    .primaryKey()
    .$defaultFn(runtimeDefaults.id);
}

function string(name: string, length = 255) {
  return varchar(name, { length });
}

function timestamp(name: string) {
  return datetime(name, { mode: "date", fsp: 3 });
}

function timestampNow(name: string) {
  return timestamp(name)
    .notNull()
    .default(sql`CURRENT_TIMESTAMP(3)`)
    .$defaultFn(runtimeDefaults.now);
}

function byteCount(name: string) {
  return bigint(name, { mode: "number" });
}

/** An index on the first `length` characters of a long column. */
function prefix(column: MySqlColumn, length: number) {
  return sql`${column}(${sql.raw(String(length))})`;
}

/**
 * The `storage_object` table: one row per tracked object. Keys must compare
 * byte for byte, so use a `utf8mb4_bin` database or `sql/mysql.sql`.
 */
export const storageObject = mysqlTable(
  "storage_object",
  {
    id: id(),
    scope: string("scope").notNull(),
    bucket: string("bucket").notNull(),
    key: string("key", 1024).notNull(),
    route: string("route").notNull(),
    folder: string("folder", 1024),
    filename: string("filename").notNull(),
    contentType: string("content_type"),
    size: byteCount("size"),
    declaredSize: byteCount("declared_size"),
    eTag: string("e_tag"),
    status: string("status", 16).$type<StorageObjectStatus>().notNull(),
    s3Metadata: json("s3_metadata").$type<Record<string, string>>(),
    attributes: json("attributes"),
    acl: string("acl"),
    uploadId: text("upload_id"),
    uploadToken: string("upload_token", 64),
    expiresAt: timestamp("expires_at"),
    confirmedAt: timestamp("confirmed_at"),
    createdAt: timestampNow("created_at"),
    updatedAt: timestampNow("updated_at"),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => [
    uniqueIndex("storage_object_bucket_key_uk").on(
      table.bucket,
      prefix(table.key, 512),
    ),
    index("storage_object_scope_folder_idx").on(
      table.scope,
      table.status,
      prefix(table.folder, 255),
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
export const storageFolder = mysqlTable(
  "storage_folder",
  {
    id: id(),
    scope: string("scope").notNull(),
    path: string("path", 1024).notNull(),
    parent: string("parent", 1024),
    name: string("name").notNull(),
    createdAt: timestampNow("created_at"),
  },
  (table) => [
    uniqueIndex("storage_folder_scope_path_uk").on(
      table.scope,
      prefix(table.path, 512),
    ),
    index("storage_folder_scope_parent_idx").on(
      table.scope,
      prefix(table.parent, 512),
    ),
  ],
);

/**
 * The FumaDB settings table. The Drizzle adapter reads the schema version
 * from the default of its `version` column, which is stored as `value`.
 */
export const dimahS3Settings = mysqlTable("private_dimah_s3_settings", {
  key: string("key").primaryKey(),
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
