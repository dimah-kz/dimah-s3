import { column, idColumn, schema, table } from "fumadb/schema";

/**
 * MySQL collation of every text column: keys, scopes, ids, names, and upload
 * tokens compare byte for byte. Search and the name sort use `search_name`,
 * which is folded, so they need no case-insensitive collation.
 */
const BINARY = { mysql: "utf8mb4_bin" };

/**
 * Longest `search_name`, in characters. Folding can lengthen a name (`ß`
 * becomes `ss`), so it has more room than the 255-character name.
 */
export const SEARCH_NAME_MAX_LENGTH = 1024;

/**
 * Longest `search_name`, in UTF-8 bytes. With the longest scope, the name
 * sort's index entry stays under PostgreSQL's 2704-byte limit for a btree
 * entry.
 */
export const SEARCH_NAME_MAX_BYTES = 1024;

/**
 * Characters of `search_name` the name sort's index covers on MySQL, where
 * an index holds at most 3072 bytes.
 */
const SEARCH_NAME_PREFIX = 255;

/**
 * InnoDB indexes at most 3072 bytes, so S3 keys and folder paths are indexed
 * on their first 512 characters on MySQL. Two keys that share those
 * characters share an index entry, and the `(bucket, key)` unique key treats
 * them as equal.
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
  /** Named dimah-s3 route that created the object. A route name has at most 64 characters. */
  route: string("route", 64),
  /** Folder that holds the object. `null` is the root. */
  folderId: string("folder_id").nullable(),
  /** Display name. The object key never changes with it. */
  name: string("name"),
  /**
   * `name` folded for search and for the name sort: lowercase, without
   * accents, with `%`, `_`, and `\` kept literal. Search matches it, and
   * the name sort orders by it, on every database the same way.
   */
  searchName: string("search_name", SEARCH_NAME_MAX_LENGTH),
  contentType: string("content_type").nullable(),
  /** Verified size from HeadObject, set on confirm. */
  size: column("size", "bigint").nullable(),
  /** Size the client declared before confirm. Quota counts it while pending. */
  declaredSize: column("declared_size", "bigint").nullable(),
  eTag: string("etag").nullable(),
  status: string("status", 16),
  /** S3 user metadata of the verified object. */
  s3Metadata: column("s3_metadata", "json").nullable(),
  /** App attributes, validated by the plugin's `attributes.schema`. */
  attributes: column("attributes", "json").nullable(),
  acl: string("acl", 16).nullable(),
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
  .index("storage_object_scope_name_idx", ["scope", "status", "searchName"], {
    length: { searchName: SEARCH_NAME_PREFIX },
  })
  .index("storage_object_scope_size_idx", ["scope", "status", "size"])
  .index("storage_object_status_expires_idx", ["status", "expiresAt"]);

/**
 * One row per folder, so an empty folder still lists. `parentId` is `""` at
 * the root: a nullable parent cannot be unique on PostgreSQL, MySQL, and
 * SQLite, and the root is not a row. `(scope, parent_id, name)` is what makes
 * a folder unique. `path` is a cache of `name` joined through the parents,
 * rewritten when a folder is renamed or moved; its index is a lookup, not a
 * constraint.
 */
const storageFolder = table("storage_folder", {
  id: idColumn("id", "varchar(255)").collate(BINARY).defaultTo$("auto"),
  scope: string("scope", SCOPE_MAX_LENGTH),
  /** Id of the containing folder. `""` is the root. */
  parentId: string("parent_id").defaultTo(""),
  /** Last segment of `path`. */
  name: string("name"),
  /** `name` folded for search, like `storage_object.search_name`. */
  searchName: string("search_name", SEARCH_NAME_MAX_LENGTH),
  /** Full folder path. */
  path: string("path", 1024),
  createdAt: column("created_at", "timestamp").defaultTo$("now"),
  updatedAt: column("updated_at", "timestamp").defaultTo$("now"),
})
  .index("storage_folder_scope_path_idx", ["scope", "path"], {
    length: { path: LONG_PREFIX },
  })
  .unique("storage_folder_scope_parent_name_uk", ["scope", "parentId", "name"]);

/**
 * The @dimah-s3/db schema, version `2.3.0`. The tables, their indexes, and
 * the MySQL collations and prefix lengths are all declared here, so FumaDB
 * creates them (`migrate`) and generates them for Drizzle and Prisma.
 */
export const dbSchema = schema({
  version: "2.3.0",
  tables: {
    storageObject,
    storageFolder,
  },
});
