import { column, idColumn, schema, table, type Column } from "fumadb/schema";

/**
 * A byte count. The column is a `bigint` (int8 on PostgreSQL and MySQL), but
 * values are bound as numbers so SQLite stores a number instead of FumaDB's
 * 8-byte blob, which would sort after every number: INTEGER in the shipped
 * SQL, or REAL in a column FumaDB created, compared by value either way.
 * Drivers read int8 back as a number, a bigint, or a string, and a 1.x
 * SQLite row not yet migrated still holds a blob (read as a bigint).
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
  /** Logical folder path. `null` is the root. */
  folder: column("folder", "string").nullable(),
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

/** One row per folder, so an empty folder still lists. */
const storageFolder = table("storage_folder", {
  id: idColumn("id", "varchar(255)").defaultTo$("auto"),
  scope: column("scope", "string"),
  /** Full folder path. */
  path: column("path", "string"),
  /** Path of the containing folder. `null` is the root. */
  parent: column("parent", "string").nullable(),
  /** Last segment of `path`. */
  name: column("name", "string"),
  createdAt: column("created_at", "timestamp").defaultTo$("now"),
}).unique("storage_folder_scope_path_uk", ["scope", "path"]);

/** A secondary index, by SQL table and column names. */
export type SchemaIndex = {
  name: string;
  table: "storage_object" | "storage_folder";
  columns: readonly string[];
};

/**
 * Secondary indexes of schema 2.0.0. FumaDB cannot declare them, so the SQL
 * files, the Drizzle tables, and the Prisma schema carry them.
 */
export const v2Indexes: readonly SchemaIndex[] = [
  {
    name: "storage_object_scope_folder_idx",
    table: "storage_object",
    columns: ["scope", "status", "folder", "created_at"],
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
  {
    name: "storage_folder_scope_parent_idx",
    table: "storage_folder",
    columns: ["scope", "parent"],
  },
];

/** The secondary indexes 1.x recommended that 2.0.0 replaces. */
const v1Indexes = [
  "storage_object_scope_status_created_idx",
  "storage_object_scope_route_idx",
  "storage_object_status_created_idx",
];

const custom = (sql: string) => ({ type: "custom" as const, sql });

/**
 * The last segment of `key`, or the whole key when it ends in `/`, in syntax
 * SQLite and PostgreSQL share. Trimming every character but `/` from the
 * right leaves the key up to its last `/`.
 */
const keyName = `COALESCE(NULLIF(substr("key", length(rtrim("key", replace("key", '/', ''))) + 1), ''), "key")`;

/**
 * Runs before the statements FumaDB generates for 1.0.0 → 2.0.0, in syntax
 * SQLite and PostgreSQL share. `filename` becomes required, so a missing one
 * is filled from the key the way `sql/upgrade/1.0.0-2.0.0/<dialect>.sql`
 * does. `migrate()` converts 1.x SQLite blob sizes afterwards.
 */
const beforeV2 = [
  custom(
    `UPDATE "storage_object" SET "filename" = ${keyName} WHERE "filename" IS NULL`,
  ),
];

/** Runs after them: the 1.x recommended indexes give way to {@link v2Indexes}. */
const afterV2 = [
  ...v1Indexes.map((name) => custom(`DROP INDEX IF EXISTS "${name}"`)),
  ...v2Indexes.map((index) => {
    const columns = index.columns.map((name) => `"${name}"`).join(", ");
    return custom(
      `CREATE INDEX IF NOT EXISTS "${index.name}" ON "${index.table}" (${columns})`,
    );
  }),
];

/**
 * Schema 2.0.0: logical folders (`folder` plus `storage_folder`), S3 metadata
 * split from typed `attributes`, the upload token, and the sort indexes.
 */
export const v2 = schema({
  version: "2.0.0",
  tables: {
    storageObject,
    storageFolder,
  },
  async up({ auto }) {
    return [...beforeV2, ...(await auto()), ...afterV2];
  },
});
