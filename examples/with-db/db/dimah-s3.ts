import { sqliteTable, text, customType, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core"
import { sql, defineRelations } from "drizzle-orm"

const customBigInt = customType<
  {
    data: bigint;
    driverData: number | bigint;
  }
>({
  dataType() {
    return "integer";
  },
  fromDriver(value) {
    return BigInt(value)
  },
  toDriver(value) {
    return value
  }
});

export const storageObject = sqliteTable("storage_object", {
  id: text("id", { length: 255 }).primaryKey().notNull(),
  scope: text("scope", { length: 255 }).notNull(),
  bucket: text("bucket", { length: 255 }).notNull(),
  key: text("key", { length: 1024 }).notNull(),
  route: text("route", { length: 255 }).notNull(),
  folderId: text("folder_id", { length: 255 }),
  filename: text("filename", { length: 255 }).notNull(),
  contentType: text("content_type", { length: 255 }),
  size: customBigInt("size"),
  declaredSize: customBigInt("declared_size"),
  eTag: text("e_tag", { length: 255 }),
  status: text("status", { length: 16 }).notNull(),
  s3Metadata: text("s3_metadata", { mode: "json" }),
  attributes: text("attributes", { mode: "json" }),
  acl: text("acl", { length: 255 }),
  uploadId: text("upload_id"),
  uploadToken: text("upload_token", { length: 64 }),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
  confirmedAt: integer("confirmed_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(sql`(cast((julianday('now') - 2440587.5)*86400000 as integer))`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(sql`(cast((julianday('now') - 2440587.5)*86400000 as integer))`),
  deletedAt: integer("deleted_at", { mode: "timestamp_ms" })
}, (table) => [
  uniqueIndex("storage_object_bucket_key_uk").on(table.bucket, table.key),
  index("storage_object_scope_folder_idx").on(table.scope, table.status, table.folderId, table.createdAt),
  index("storage_object_scope_updated_idx").on(table.scope, table.status, table.updatedAt),
  index("storage_object_scope_filename_idx").on(table.scope, table.status, table.filename),
  index("storage_object_scope_size_idx").on(table.scope, table.status, table.size),
  index("storage_object_status_expires_idx").on(table.status, table.expiresAt)
])

export const storageFolder = sqliteTable("storage_folder", {
  id: text("id", { length: 255 }).primaryKey().notNull(),
  scope: text("scope", { length: 255 }).notNull(),
  parentId: text("parent_id", { length: 255 }).notNull().default(""),
  name: text("name", { length: 255 }).notNull(),
  path: text("path", { length: 1024 }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(sql`(cast((julianday('now') - 2440587.5)*86400000 as integer))`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(sql`(cast((julianday('now') - 2440587.5)*86400000 as integer))`)
}, (table) => [
  uniqueIndex("storage_folder_scope_path_uk").on(table.scope, table.path),
  uniqueIndex("storage_folder_scope_parent_name_uk").on(table.scope, table.parentId, table.name)
])

export const private_dimah_s3_settings = sqliteTable("private_dimah_s3_settings", {
  key: text("key", { length: 255 }).primaryKey().notNull(),
  version: text("value").notNull().default("2.1.0")
})

export const relations = defineRelations({ storageObject, storageFolder, private_dimah_s3_settings })