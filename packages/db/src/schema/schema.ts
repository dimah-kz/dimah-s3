import { column, idColumn, schema, table } from "fumadb/schema";

/**
 * MySQL collation of every text column but `filename`: keys, scopes, ids, and
 * upload tokens compare byte for byte.
 */
const BINARY = { mysql: "utf8mb4_bin" };

/** MySQL collation of `filename`: case-insensitive, for search. */
const TEXT = { mysql: "utf8mb4_unicode_ci" };

/**
 * InnoDB indexes at most 3072 bytes, so S3 keys and folder paths are indexed
 * on their first 512 characters on MySQL. Two values that share those
 * characters share an index entry, and the unique keys treat them as equal.
 */
const LONG_PREFIX = 512;

/**
 * Longest scope `resolveScope` may return, in characters. The `scope`
 * columns are `varchar(255)`.
 */
export const SCOPE_MAX_LENGTH = 255;

function string(name: string, length = 255) {
  return column(name, `varchar(${length})`).collate(BINARY);
}

/**
 * One row per tracked object:
 * `pending` (presigned) → `active` (confirmed) → `deleted` (soft delete).
 * `purging` marks a stale pending row that purge has claimed.
 */
const storageObject = table("storage_object", {
  id: idColumn("id", "varchar(255)").collate(BINARY).defaultTo$("auto"),
  /** Owner, for example `user:123` or `org:acme`. */
  scope: string("scope", SCOPE_MAX_LENGTH),
  bucket: string("bucket"),
  key: string("key", 1024),
  /** Named dimah-s3 route that created the object. */
  route: string("route"),
  /** Folder that holds the object. `null` is the root. */
  folderId: string("folder_id").nullable(),
  filename: column("filename", "varchar(255)").collate(TEXT),
  contentType: string("content_type").nullable(),
  /** Verified size from HeadObject, set on confirm. */
  size: column("size", "bigint").nullable(),
  /** Size the client declared before confirm. Quota counts it while pending. */
  declaredSize: column("declared_size", "bigint").nullable(),
  eTag: string("e_tag").nullable(),
  status: string("status", 16),
  /** S3 user metadata of the verified object. */
  s3Metadata: column("s3_metadata", "json").nullable(),
  /** App attributes, validated by the plugin's `attributes.schema`. */
  attributes: column("attributes", "json").nullable(),
  acl: string("acl").nullable(),
  /** Multipart upload ID while the row is pending. */
  uploadId: column("upload_id", "string").collate(BINARY).nullable(),
  /** Token of the upload ticket that wrote the row. Confirm and purge match it. */
  uploadToken: string("upload_token", 64).nullable(),
  /** Confirm deadline of a pending row (the upload ticket's expiry). */
  expiresAt: column("expires_at", "timestamp").nullable(),
  confirmedAt: column("confirmed_at", "timestamp").nullable(),
  createdAt: column("created_at", "timestamp").defaultTo$("now"),
  updatedAt: column("updated_at", "timestamp").defaultTo$("now"),
  deletedAt: column("deleted_at", "timestamp").nullable(),
})
  .unique("storage_object_bucket_key_uk", ["bucket", "key"], {
    length: { key: LONG_PREFIX },
  })
  .index("storage_object_scope_folder_idx", [
    "scope",
    "status",
    "folderId",
    "createdAt",
  ])
  .index("storage_object_scope_updated_idx", ["scope", "status", "updatedAt"])
  .index("storage_object_scope_filename_idx", ["scope", "status", "filename"])
  .index("storage_object_scope_size_idx", ["scope", "status", "size"])
  .index("storage_object_status_expires_idx", ["status", "expiresAt"]);

/**
 * One row per folder, so an empty folder still lists. `parentId` is `""` at
 * the root: a nullable parent cannot be unique on PostgreSQL, MySQL, and
 * SQLite, and the root is not a row. `path` is a cache of `name` joined
 * through the parents, rewritten when a folder is renamed or moved.
 */
const storageFolder = table("storage_folder", {
  id: idColumn("id", "varchar(255)").collate(BINARY).defaultTo$("auto"),
  scope: string("scope", SCOPE_MAX_LENGTH),
  /** Id of the containing folder. `""` is the root. */
  parentId: string("parent_id").defaultTo(""),
  /** Last segment of `path`. */
  name: string("name"),
  /** Full folder path. */
  path: string("path", 1024),
  createdAt: column("created_at", "timestamp").defaultTo$("now"),
  updatedAt: column("updated_at", "timestamp").defaultTo$("now"),
})
  .unique("storage_folder_scope_path_uk", ["scope", "path"], {
    length: { path: LONG_PREFIX },
  })
  .unique("storage_folder_scope_parent_name_uk", ["scope", "parentId", "name"]);

/**
 * The @dimah-s3/db schema, version `2.1.0`. The tables, their indexes, and
 * the MySQL collations and prefix lengths are all declared here, so FumaDB
 * creates them (`migrate`) and generates them for Drizzle and Prisma.
 */
export const dbSchema = schema({
  version: "2.1.0",
  tables: {
    storageObject,
    storageFolder,
  },
});
