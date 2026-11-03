import { column, idColumn, schema, table, type Column } from "fumadb/schema";

/**
 * A byte count. The column is a `bigint` (int8 on PostgreSQL and MySQL), but
 * values are bound as numbers so SQLite stores a number instead of FumaDB's
 * 8-byte blob, which would sort after every number: INTEGER in the shipped
 * SQL, or REAL in a column FumaDB created, compared by value either way.
 * Drivers read int8 back as a number, a bigint, or a string.
 */
function byteCount(name: string) {
  return column(name, "bigint").nullable() as unknown as Column<
    "bigint",
    number | null,
    number | bigint | string | null
  >;
}

/**
 * One row per tracked object:
 * `pending` (presigned) → `active` (confirmed) → `deleted` (soft delete).
 * `purging` marks a stale pending row that purge has claimed.
 */
const storageObject = table("storage_object", {
  id: idColumn("id", "varchar(255)").defaultTo$("auto"),
  /** Owner, for example `user:123` or `org:acme`. */
  scope: column("scope", "string"),
  bucket: column("bucket", "string"),
  key: column("key", "string"),
  /** Named dimah-s3 route that created the object. */
  route: column("route", "string"),
  /** Folder that holds the object. `null` is the root. */
  folderId: column("folder_id", "string").nullable(),
  filename: column("filename", "string"),
  contentType: column("content_type", "string").nullable(),
  /** Verified size from HeadObject, set on confirm. */
  size: byteCount("size"),
  /** Size the client declared before confirm. Quota counts it while pending. */
  declaredSize: byteCount("declared_size"),
  eTag: column("e_tag", "string").nullable(),
  status: column("status", "string"),
  /** S3 user metadata of the verified object. */
  s3Metadata: column("s3_metadata", "json").nullable(),
  /** App attributes, validated by the plugin's `attributes.schema`. */
  attributes: column("attributes", "json").nullable(),
  acl: column("acl", "string").nullable(),
  /** Multipart upload ID while the row is pending. */
  uploadId: column("upload_id", "string").nullable(),
  /** Token of the upload ticket that wrote the row. Confirm and purge match it. */
  uploadToken: column("upload_token", "string").nullable(),
  /** Confirm deadline of a pending row (the upload ticket's expiry). */
  expiresAt: column("expires_at", "timestamp").nullable(),
  confirmedAt: column("confirmed_at", "timestamp").nullable(),
  createdAt: column("created_at", "timestamp").defaultTo$("now"),
  updatedAt: column("updated_at", "timestamp").defaultTo$("now"),
  deletedAt: column("deleted_at", "timestamp").nullable(),
}).unique("storage_object_bucket_key_uk", ["bucket", "key"]);

/**
 * One row per folder, so an empty folder still lists. `parentId` is `""` at
 * the root: a nullable parent cannot be unique on PostgreSQL, MySQL, and
 * SQLite, and the root is not a row. `path` is a cache of `name` joined
 * through the parents, rewritten when a folder is renamed or moved.
 */
const storageFolder = table("storage_folder", {
  id: idColumn("id", "varchar(255)").defaultTo$("auto"),
  scope: column("scope", "string"),
  /** Id of the containing folder. `""` is the root. */
  parentId: column("parent_id", "string"),
  /** Last segment of `path`. */
  name: column("name", "string"),
  /** Full folder path. */
  path: column("path", "string"),
  createdAt: column("created_at", "timestamp").defaultTo$("now"),
  updatedAt: column("updated_at", "timestamp").defaultTo$("now"),
})
  .unique("storage_folder_scope_path_uk", ["scope", "path"])
  .unique("storage_folder_scope_parent_name_uk", ["scope", "parentId", "name"]);

/** A secondary index, by SQL table and column names. */
export type SchemaIndex = {
  name: string;
  table: "storage_object" | "storage_folder";
  columns: readonly string[];
};

/**
 * Secondary indexes. FumaDB cannot declare them, so {@link dbSchema}'s
 * migration, the SQL files, the Drizzle tables, and the Prisma schema carry
 * them.
 */
export const schemaIndexes: readonly SchemaIndex[] = [
  {
    name: "storage_object_scope_folder_idx",
    table: "storage_object",
    columns: ["scope", "status", "folder_id", "created_at"],
  },
  {
    name: "storage_object_scope_updated_idx",
    table: "storage_object",
    columns: ["scope", "status", "updated_at"],
  },
  {
    name: "storage_object_scope_filename_idx",
    table: "storage_object",
    columns: ["scope", "status", "filename"],
  },
  {
    name: "storage_object_scope_size_idx",
    table: "storage_object",
    columns: ["scope", "status", "size"],
  },
  {
    name: "storage_object_status_expires_idx",
    table: "storage_object",
    columns: ["status", "expires_at"],
  },
];

const custom = (sql: string) => ({ type: "custom" as const, sql });

/**
 * FumaDB runs `up` only when migrating from the previous entry, and skips
 * `up` on the first one. This empty entry exists so {@link dbSchema} can
 * create the indexes on a new database. A finished database is at
 * {@link dbSchema}.
 */
export const PREDECESSOR_VERSION = "0.0.1";

export const predecessor = schema({
  version: PREDECESSOR_VERSION,
  tables: {},
});

/**
 * The @dimah-s3/db schema, version `2.1.0`. The migration creates the
 * secondary indexes after the tables, because FumaDB cannot declare them.
 */
export const dbSchema = schema({
  version: "2.1.0",
  tables: {
    storageObject,
    storageFolder,
  },
  async up({ auto }) {
    const indexes = schemaIndexes.map((index) => {
      const columns = index.columns.map((name) => `"${name}"`).join(", ");
      return custom(
        `CREATE INDEX IF NOT EXISTS "${index.name}" ON "${index.table}" (${columns})`,
      );
    });
    return [...(await auto()), ...indexes];
  },
});
