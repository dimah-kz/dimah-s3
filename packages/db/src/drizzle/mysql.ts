/**
 * Drizzle schema for @dimah-s3/db on MySQL 8. Copy this file into your app
 * (`db/schema.ts`) to own the tables and add columns. Keep the table names,
 * the column names, and the `dimahS3Tables` keys: the adapter finds the
 * tables by those keys. A column you add must be nullable or have a default.
 * The plugin does not read or write it.
 *
 * Import `dimahS3Tables` from `@dimah-s3/db/drizzle/mysql` when the tables
 * stay as they are. `drizzle-kit` then follows that import, and a later push
 * drops a column that is not part of it.
 *
 * Columns, collations and indexes match `sql/mysql.sql`, including the
 * prefix indexes on `key`, `folder`, `path` and `parent`. Keys, folders and
 * scopes compare byte for byte (`utf8mb4_bin`), and file names
 * case-insensitively (`utf8mb4_unicode_ci`). Requires `drizzle-orm` and
 * `@paralleldrive/cuid2`.
 */
import { createId } from "@paralleldrive/cuid2";
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

type StorageObjectStatus = "pending" | "active" | "deleted" | "purging";

const SCHEMA_VERSION = "2.0.0";

/** Collation of every text column but `filename`: byte for byte. */
const BINARY = "utf8mb4_bin";

function id() {
  return string("id")
    .primaryKey()
    .$defaultFn(() => createId());
}

function string(name: string, length = 255) {
  return varchar(name, { length }).collate(BINARY);
}

function timestamp(name: string) {
  return datetime(name, { mode: "date", fsp: 3 });
}

function timestampNow(name: string) {
  return timestamp(name)
    .notNull()
    .default(sql`CURRENT_TIMESTAMP(3)`)
    .$defaultFn(() => new Date());
}

function byteCount(name: string) {
  return bigint(name, { mode: "number" });
}

/** An index on the first `length` characters of a long column. */
function prefix(column: MySqlColumn, length: number) {
  return sql`${column}(${sql.raw(String(length))})`;
}

/** The `storage_object` table: one row per tracked object. */
export const storageObject = mysqlTable(
  "storage_object",
  {
    id: id(),
    scope: string("scope").notNull(),
    bucket: string("bucket").notNull(),
    key: string("key", 1024).notNull(),
    route: string("route").notNull(),
    folder: string("folder", 1024),
    filename: varchar("filename", { length: 255 })
      .collate("utf8mb4_unicode_ci")
      .notNull(),
    contentType: string("content_type"),
    size: byteCount("size"),
    declaredSize: byteCount("declared_size"),
    eTag: string("e_tag"),
    status: string("status", 16).$type<StorageObjectStatus>().notNull(),
    s3Metadata: json("s3_metadata").$type<Record<string, string>>(),
    attributes: json("attributes"),
    acl: string("acl"),
    uploadId: text("upload_id").collate(BINARY),
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
  version: text("value").collate(BINARY).notNull().default(SCHEMA_VERSION),
});

/**
 * Every @dimah-s3/db table. Spread it into your Drizzle schema and keep its
 * keys, because the FumaDB Drizzle adapter finds tables by them:
 * `drizzle({ client, relations: defineRelations({ ...dimahS3Tables }) })`.
 */
export const dimahS3Tables = {
  storageObject,
  storageFolder,
  private_dimah_s3_settings: dimahS3Settings,
};
