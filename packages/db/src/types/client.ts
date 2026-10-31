import type { StorageObjectStatus } from "./storage-object";

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
  /** Logical folder path. `null` is the root. */
  folder: string | null;
  filename: string;
  contentType: string | null;
  /** Verified size. `null` while the object is pending. */
  size: number | null;
  declaredSize: number | null;
  status: StorageObjectStatus;
  attributes: TClientAttributes | null;
  /** ISO 8601 timestamp. */
  createdAt: string;
  /** ISO 8601 timestamp. */
  updatedAt: string;
};

/** Browser-facing folder row. */
export type DbClientFolder = {
  path: string;
  name: string;
  /** Path of the containing folder. `null` is the root. */
  parent: string | null;
  /** ISO 8601 timestamp. */
  createdAt: string;
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
  /** Folder to list. `""` is the root. Omit for a flat list of every folder. */
  folder?: string;
  route?: string;
  status?: StorageObjectStatus;
  contentType?: string;
  /** Text the `filename` contains. Case follows the database collation. */
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
  /** Scope the server resolved for the request. */
  scope: string;
  objects: DbClientObject<TClientAttributes>[];
  /** `null` on the last page. */
  nextCursor: string | null;
  /** Direct child folders of `folder`, at most 1000. First page only. */
  folders?: DbClientFolder[];
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
  /** Folder path. `null` moves the object to the root. */
  folder?: string | null;
  /** Replaces the attributes. Needs the plugin's `attributes.schema`. */
  attributes?: Record<string, unknown>;
};

/** Body of `POST /db/folder` and query of `DELETE /db/folder`. */
export type DbClientFolderInput = {
  path: string;
};

/** Per-call request options of {@link DbClientActions}. */
export type DbClientRequestInit = {
  signal?: AbortSignal;
};

/** The db endpoints as client actions (`api.db`). */
export type DbClientActions<TClientAttributes = never> = {
  listObjects(
    input?: DbClientListInput,
    init?: DbClientRequestInit,
  ): Promise<DbClientListResponse<TClientAttributes>>;
  getObject(
    input: DbClientGetInput,
    init?: DbClientRequestInit,
  ): Promise<{ object: DbClientObject<TClientAttributes> }>;
  updateObject(
    input: DbClientUpdateInput,
    init?: DbClientRequestInit,
  ): Promise<{ object: DbClientObject<TClientAttributes> }>;
  createFolder(
    input: DbClientFolderInput,
    init?: DbClientRequestInit,
  ): Promise<{ folder: DbClientFolder }>;
  deleteFolder(
    input: DbClientFolderInput,
    init?: DbClientRequestInit,
  ): Promise<{ path: string }>;
};

/** Filters `dbObjectSource` sends with every page. */
export type DbObjectSourceOptions = {
  route?: string;
  status?: StorageObjectStatus;
  contentType?: string;
  /** Rows per page. The server caps it at 100. */
  limit?: number;
  /** List one folder at a time, with folder rows. @default true */
  folders?: boolean;
};

/** A folder row of {@link DbObjectSource}. `id` is the folder path. */
export type DbObjectSourceFolder = {
  id: string;
  name: string;
};

/** The `useObjectList` query input. Mirrors react's `ObjectListQueryInput`. */
export type DbObjectSourceQueryInput = {
  /** Folder path. `null` is the root. */
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
  /** Upload options for files dropped into `parent`. Root is `""`. */
  uploadOptions?: (parent: string | null) => {
    metadata: Record<string, string>;
  };
  /** Creates `name` inside `parent`. */
  createFolder?: (input: {
    parent: string | null;
    name: string;
  }) => Promise<DbObjectSourceFolder>;
};
