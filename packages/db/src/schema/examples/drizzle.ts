/**
 * Reference Drizzle schema — same shape as FumaDB `generate` (SQLite), plus
 * the recommended secondary indexes. Not imported by `@dimah-s3/db` at runtime.
 *
 * `fumadb/cuid` is not a real fumadb export; map it to `@paralleldrive/cuid2`
 * in tsconfig (this package and `examples/with-db` already do).
 *
 * @see ../v1.ts
 * @see ./schema.prisma
 */
import {
  sqliteTable,
  text,
  blob,
  integer,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";
import { createId } from "fumadb/cuid";

export const storageObject = sqliteTable(
  "storage_object",
  {
    id: text("id", { length: 255 })
      .primaryKey()
      .notNull()
      .$defaultFn(() => createId()),
    scope: text("scope").notNull(),
    bucket: text("bucket").notNull(),
    key: text("key").notNull(),
    route: text("route").notNull(),
    contentType: text("content_type"),
    size: blob("size", { mode: "bigint" }),
    eTag: text("e_tag"),
    filename: text("filename"),
    status: text("status").notNull(),
    metadata: blob("metadata", { mode: "json" }),
    acl: text("acl"),
    uploadId: text("upload_id"),
    declaredSize: blob("declared_size", { mode: "bigint" }),
    confirmedAt: integer("confirmed_at", { mode: "timestamp" }),
    expiresAt: integer("expires_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .defaultNow(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .defaultNow(),
    deletedAt: integer("deleted_at", { mode: "timestamp" }),
  },
  (table) => [
    uniqueIndex("storage_object_bucket_key_uk").on(table.bucket, table.key),
    // Consumer-added — FumaDB generate does not emit these (yet).
    index("storage_object_scope_status_created_idx").on(
      table.scope,
      table.status,
      table.createdAt,
    ),
    index("storage_object_scope_route_idx").on(table.scope, table.route),
    index("storage_object_status_expires_idx").on(
      table.status,
      table.expiresAt,
    ),
    index("storage_object_status_created_idx").on(
      table.status,
      table.createdAt,
    ),
  ],
);

export const private_dimah_s3_settings = sqliteTable(
  "private_dimah_s3_settings",
  {
    id: text("id", { length: 255 }).primaryKey().notNull(),
    version: text("version", { length: 255 }).notNull().default("1.0.0"),
  },
);
