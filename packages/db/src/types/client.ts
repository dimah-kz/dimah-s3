import type { S3RequestOptions, S3RouteName } from "@dimah-s3/core";
import type { StorageObjectStatus } from "./storage-object";

/** A row status the browser can see. Rows that purge has claimed stay internal. */
export type DbClientObjectStatus = Exclude<StorageObjectStatus, "purging">;

/**
 * Browser-facing object row. Narrower than `StorageObject`: no scope,
 * S3 metadata, or upload state. `attributes` are the plugin's
 * `attributes.toClient` output.
 */
export type DbClientObject<TClientAttributes = never> = {
  id: string;
  bucket: string;
  key: string;
  route: string;
  /** Folder that holds the object. `null` is the root. */
  folderId: string | null;
  filename: string;
  contentType: string | null;
  /** Verified size. `null` while the object is pending. */
  size: number | null;
  declaredSize: number | null;
  status: DbClientObjectStatus;
  attributes: TClientAttributes | null;
  /** ISO 8601 timestamp. */
  createdAt: string;
  /** ISO 8601 timestamp. */
  updatedAt: string;
};

/** Browser-facing folder row. */
export type DbClientFolder = {
  id: string;
  name: string;
  /** Containing folder. `null` is the root. */
  parentId: string | null;
  /** Full path, from the root. It changes when an ancestor is renamed. */
  path: string;
  /** ISO 8601 timestamp. */
  createdAt: string;
  /** ISO 8601 timestamp. */
  updatedAt: string;
};

/** Column a listing can be ordered by. */
export type DbListSortField = "createdAt" | "updatedAt" | "size" | "filename";

/**
 * Listing order. Ties break on row `id` in the same direction. Rows with no
 * value for the field (a pending row's `size`) come last in both directions.
 */
export type DbListSort = {
  field: DbListSortField;
  direction: "asc" | "desc";
};

/** Bytes and file count of a scope. Expired pending rows are not counted. */
export type DbUsage = {
  totalBytes: number;
  objectCount: number;
};

/** Caps for one scope. Omit a field for no cap. */
export type DbQuota = {
  maxBytes?: number;
  maxFiles?: number;
};

/**
 * Query for `GET /db/objects`. The scope is not an input: the server
 * resolves it from the request.
 */
export type DbClientListInput = {
  /**
   * Folder to list. `null` (or `""`) is the root. Omit for a flat list of
   * every folder.
   */
  folderId?: string | null;
  route?: S3RouteName;
  /** @default "active" */
  status?: DbClientObjectStatus;
  /** Exact type, or `type/*` for every subtype (`image/*`). */
  contentType?: string;
  /**
   * Text the `filename` contains. The database decides case: PostgreSQL
   * matches it exactly, SQLite ignores ASCII case, and MySQL follows the
   * column collation.
   */
  search?: string;
  /** @default { field: "createdAt", direction: "desc" } */
  sort?: DbListSort;
  /** Rows per page, 1 to 100. @default 50 */
  limit?: number;
  /**
   * `nextCursor` from the previous page. A cursor from other filters is
   * ignored, and the list starts again at the first page.
   */
  cursor?: string;
};

/** One page of `GET /db/objects`. */
export type DbClientListResponse<TClientAttributes = never> = {
  objects: DbClientObject<TClientAttributes>[];
  /** `null` on the last page. */
  nextCursor: string | null;
  /**
   * Direct child folders of `folderId`, at most 1000, and only those whose
   * name contains `search` when it is set. First page only.
   */
  folders?: DbClientFolder[];
  /**
   * Folders from the root down to the open folder. Empty at the root.
   * First page only, and only when `folderId` is set.
   */
  trail?: DbClientFolder[];
  /** First page only. */
  usage?: DbUsage;
  /** Caps for the scope, `null` when there are none. First page only. */
  limits?: DbQuota | null;
};

/** Identifies one object. `bucket` defaults to the only configured bucket. */
export type DbClientGetInput = {
  key: string;
  bucket?: string;
};

/** Body of `PATCH /db/object`. Omitted fields stay as they are. */
export type DbClientUpdateInput = DbClientGetInput & {
  filename?: string;
  /** Folder id. `null` moves the object to the root. */
  folderId?: string | null;
  /**
   * Replaces the attributes, checked by the plugin's `attributes.schema`.
   * `null` clears them.
   */
  attributes?: Record<string, unknown> | null;
};

/** Body of `POST /db/folder`. `parentId` omitted or `null` is the root. */
export type DbClientCreateFolderInput = {
  parentId?: string | null;
  name: string;
};

/** Body of `PATCH /db/folder`. An omitted field stays as it is. */
export type DbClientUpdateFolderInput = {
  id: string;
  name?: string;
  /** `null` moves the folder to the root. */
  parentId?: string | null;
};

/** Query of `DELETE /db/folder`. */
export type DbClientDeleteFolderInput = {
  id: string;
};

/**
 * The db endpoints as client actions (`api.db`). Each takes the same
 * per-call `{ signal, headers }` as the core methods.
 */
export type DbClientActions<TClientAttributes = never> = {
  listObjects(
    input?: DbClientListInput,
    options?: S3RequestOptions,
  ): Promise<DbClientListResponse<TClientAttributes>>;
  getObject(
    input: DbClientGetInput,
    options?: S3RequestOptions,
  ): Promise<{ object: DbClientObject<TClientAttributes> }>;
  updateObject(
    input: DbClientUpdateInput,
    options?: S3RequestOptions,
  ): Promise<{ object: DbClientObject<TClientAttributes> }>;
  createFolder(
    input: DbClientCreateFolderInput,
    options?: S3RequestOptions,
  ): Promise<{ folder: DbClientFolder }>;
  updateFolder(
    input: DbClientUpdateFolderInput,
    options?: S3RequestOptions,
  ): Promise<{ folder: DbClientFolder }>;
  deleteFolder(
    input: DbClientDeleteFolderInput,
    options?: S3RequestOptions,
  ): Promise<{ id: string }>;
};

/** Filters `dbObjectSource` sends with every page. */
export type DbObjectSourceOptions = {
  route?: S3RouteName;
  /** @default "active" */
  status?: DbClientObjectStatus;
  /** Exact type, or `type/*` for every subtype (`image/*`). */
  contentType?: string;
  /** Rows per page. The server caps it at 100. */
  limit?: number;
  /** List one folder at a time, with folder rows. @default true */
  folders?: boolean;
};

/** A folder row of {@link DbObjectSource}. `id` is the folder id. */
export type DbObjectSourceFolder = {
  id: string;
  name: string;
};

/** The `useObjectList` query input. Mirrors react's `ObjectListQueryInput`. */
export type DbObjectSourceQueryInput = {
  /** Folder id. `null` is the root. */
  parent: string | null;
  cursor: string | null;
  /** `name`, `size`, or `updatedAt`. Other fields keep the default order. */
  sort: { field: string; direction: "asc" | "desc" } | null;
  search: string;
  signal: AbortSignal;
};

/** One page of {@link DbObjectSource}. Mirrors react's `ObjectListPage`. */
export type DbObjectSourcePage<TClientAttributes = never> = {
  items: DbClientObject<TClientAttributes>[];
  /** First page only. */
  folders?: DbObjectSourceFolder[];
  /**
   * Folders from the root down to `parent`. First page only.
   * `useObjectList` shows these names in the breadcrumb.
   */
  trail?: DbObjectSourceFolder[];
  nextCursor: string | null;
  /** Scope usage with its caps. First page only. */
  usage?: DbUsage & DbQuota;
};

/** How the list reads one row. Mirrors react's `ObjectListFile`. */
export type DbObjectSourceFile = {
  name: string;
  objectKey: string;
  size: number | null;
  contentType: string | null;
  /** The row's `updatedAt`. */
  updatedAt: string;
};

/**
 * A `useObjectList` source over `GET /db/objects`. Typed structurally so db
 * does not depend on react; a type test checks it against `ObjectListSource`.
 */
export type DbObjectSource<TClientAttributes = never> = {
  query: (
    input: DbObjectSourceQueryInput,
  ) => Promise<DbObjectSourcePage<TClientAttributes>>;
  getKey: (item: DbClientObject<TClientAttributes>) => string;
  getFile: (item: DbClientObject<TClientAttributes>) => DbObjectSourceFile;
  /** Upload options for files dropped into `parent`. The root sends `""`. */
  uploadOptions?: (parent: string | null) => {
    metadata: Record<string, string>;
  };
  /** Creates `name` inside `parent`. */
  createFolder?: (input: {
    parent: string | null;
    name: string;
  }) => Promise<DbObjectSourceFolder>;
  /**
   * Renames a file's `filename`. The object `key` stays. Set when `api.db`
   * has `updateObject`.
   */
  renameFile?: (input: {
    item: DbClientObject<TClientAttributes>;
    name: string;
  }) => Promise<DbClientObject<TClientAttributes>>;
  /**
   * Renames a folder. Its id stays. Set when `api.db` has `updateFolder`
   * and `folders` is on.
   */
  renameFolder?: (input: {
    folder: DbObjectSourceFolder;
    name: string;
  }) => Promise<DbObjectSourceFolder>;
};
