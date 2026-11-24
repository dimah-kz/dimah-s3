import { sqliteTable, text, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core"
import { sql, defineRelations } from "drizzle-orm"

export const shareLink = sqliteTable("share_link", {
  id: text("id", { length: 255 }).primaryKey().notNull(),
  token: text("token", { length: 64 }).notNull(),
  scope: text("scope", { length: 255 }).notNull(),
  targetType: text("target_type", { length: 16 }).notNull(),
  objectId: text("object_id", { length: 255 }),
  folderId: text("folder_id", { length: 255 }),
  label: text("label", { length: 255 }),
  passwordHash: text("password_hash", { length: 255 }),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
  maxDownloads: integer("max_downloads"),
  downloadCount: integer("download_count").notNull().default(0),
  viewCount: integer("view_count").notNull().default(0),
  countToken: text("count_token", { length: 32 }),
  lastAccessedAt: integer("last_accessed_at", { mode: "timestamp_ms" }),
  revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(sql`(cast((julianday('now') - 2440587.5)*86400000 as integer))`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(sql`(cast((julianday('now') - 2440587.5)*86400000 as integer))`)
}, (table) => [
  uniqueIndex("share_link_token_uk").on(table.token),
  index("share_link_scope_created_idx").on(table.scope, table.createdAt),
  index("share_link_object_idx").on(table.objectId),
  index("share_link_folder_idx").on(table.folderId)
])

export const private_dimah_s3_share_settings = sqliteTable("private_dimah_s3_share_settings", {
  key: text("key", { length: 255 }).primaryKey().notNull(),
  version: text("value").notNull().default("1.0.0")
})

export const relations = defineRelations({ shareLink, private_dimah_s3_share_settings })