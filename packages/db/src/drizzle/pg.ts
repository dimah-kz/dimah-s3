/**
 * Drizzle schema for @dimah-s3/db on PostgreSQL. Copy this file into your
 * app (`db/schema.ts`) to own the tables and add columns. Keep the table
 * names, the column names, and the `dimahS3Tables` keys: the adapter finds
 * the tables by those keys. A column you add must be nullable or have a
 * default. The plugin does not read or write it.
 *
 * Import `dimahS3Tables` from `@dimah-s3/db/drizzle/pg` when the tables stay
 * as they are. `drizzle-kit` then follows that import, and a later push
 * drops a column that is not part of it.
 *
 * Matches `sql/pg.sql`. Requires `drizzle-orm` and `@paralleldrive/cuid2`.
 */
import { createId } from "@paralleldrive/cuid2";
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

type StorageObjectStatus = "pending" | "active" | "deleted" | "purging";

const SCHEMA_VERSION = "2.1.0";

function id() {
  return varchar("id", { length: 255 })
    .primaryKey()
    .$defaultFn(() => createId());
}

function timestampNow(name: string) {
  return timestamp(name)
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`)
    .$defaultFn(() => new Date());
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
    folderId: text("folder_id"),
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
      table.folderId,
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
    /** `""` is the root. */
    parentId: text("parent_id").notNull().default(""),
    name: text("name").notNull(),
    path: text("path").notNull(),
    createdAt: timestampNow("created_at"),
    updatedAt: timestampNow("updated_at"),
  },
  (table) => [
    unique("storage_folder_scope_path_uk").on(table.scope, table.path),
    unique("storage_folder_scope_parent_name_uk").on(
      table.scope,
      table.parentId,
      table.name,
    ),
  ],
);

/**
 * The FumaDB settings table. The Drizzle adapter reads the schema version
 * from the default of its `version` column, which is stored as `value`.
 */
export const dimahS3Settings = pgTable("private_dimah_s3_settings", {
  key: varchar("key", { length: 255 }).primaryKey(),
  version: text("value").notNull().default(SCHEMA_VERSION),
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
