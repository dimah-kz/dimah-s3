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
  name: string;
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
  /**
   * Bytes in this folder and every folder below it. Set on the folders of
   * a listing. `0` is an empty folder.
   */
  size?: number;
  /**
   * Files in this folder and every folder below it. Set on the folders of
   * a listing. `0` is an empty folder.
   */
  objectCount?: number;
};

/** Column a listing can be ordered by. */
export type DbListSortField = "createdAt" | "updatedAt" | "size" | "name";

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
  /** Most folders the scope may hold. `POST /db/folder` checks it. */
  maxFolders?: number;
};

/**
 * Query for `GET /db/objects`. The scope is not an input: the server
 * resolves it from the request.
 */
export type DbClientListObjectsInput = {
  /**
   * Folder to list. `null` (or `""`) is the root. Omit for a flat list of
   * every folder.
   */
  folderId?: string | null;
  /**
   * With `folderId`, also list every folder below it: objects from the
   * whole subtree, and every folder in it as `folders`. At the root that is
   * the whole scope. Each page carries `locations`, so a row can say where
   * it is. `authorize` sees `recursive: true`.
   */
  recursive?: boolean;
  route?: S3RouteName;
  /** @default "active" */
  status?: DbClientObjectStatus;
  /** Exact type, or `type/*` for every subtype (`image/*`). */
  contentType?: string;
  /**
   * Text the `name` contains. Case, accents, and look-alike letters
   * (`ي`/`ی`, `ك`/`ک`) do not count, Persian and Arabic-Indic digits match
   * `0`–`9`, and `%` and `_` are plain text, the same on every database.
   * With `folderId`, folder names are matched the same way.
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
  /**
   * Ask for the scope's `usage` on the first page. It reads every row of
   * the scope, so it is off unless the plugin sets a `quota`, which sends
   * it either way.
   */
  usage?: boolean;
};

/** One page of `GET /db/objects`. */
export type DbClientListObjectsResponse<TClientAttributes = never> = {
  objects: DbClientObject<TClientAttributes>[];
  /** `null` on the last page. */
  nextCursor: string | null;
  /**
   * Direct child folders of `folderId`, or with `recursive` every folder
   * below it, by name. At most 1000, and only those whose name contains
   * `search` when it is set. First page only, and only when `folderId` is
   * set.
   */
  folders?: DbClientFolder[];
  /**
   * Folders from the root down to the open folder. Empty at the root.
   * First page only, and only when `folderId` is set.
   */
  trail?: DbClientFolder[];
  /**
   * With `recursive`, every folder on the way to the objects of this page
   * and, on the first page, to `folders`: walk `parentId` from a row's
   * `folderId` to draw where it lives. Every page.
   */
  locations?: DbClientFolder[];
  /** Objects that match, across every page. First page of a search only. */
  total?: number;
  /**
   * Bytes and files of the scope, in every folder. First page only, and
   * only when the plugin sets a `quota` or the query asks with `usage: true`.
   */
  usage?: DbUsage;
  /** Caps for the scope, `null` when there are none. First page only. */
  limits?: DbQuota | null;
};

/** Identifies one object. `bucket` defaults to the only configured bucket. */
export type DbClientGetObjectInput = {
  key: string;
  bucket?: string;
};

/** Body of `PATCH /db/object`. Omitted fields stay as they are. */
export type DbClientUpdateObjectInput = DbClientGetObjectInput & {
  /** New display name. The object key stays as it is. */
  name?: string;
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
  /**
   * Remove the folders below it too. Still `FOLDER_NOT_EMPTY` while any
   * of them holds an object.
   */
  recursive?: boolean;
};

/**
 * The db endpoints as client actions (`api.db`). Each takes the same
 * per-call `{ signal, headers }` as the core methods.
 */
export type DbClientActions<TClientAttributes = never> = {
  listObjects(
    input?: DbClientListObjectsInput,
    options?: S3RequestOptions,
  ): Promise<DbClientListObjectsResponse<TClientAttributes>>;
  getObject(
    input: DbClientGetObjectInput,
    options?: S3RequestOptions,
  ): Promise<{ object: DbClientObject<TClientAttributes> }>;
  updateObject(
    input: DbClientUpdateObjectInput,
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
  /** Rows per page, 1 to 100. A value outside that is clamped to it. */
  limit?: number;
  /**
   * Ask the server for the scope's usage line when the plugin sets no
   * `quota`. With a quota, the list has it either way. It reads every row
   * of the scope on the first page.
   * @default false
   */
  usage?: boolean;
  /** List one folder at a time, with folder rows. @default true */
  folders?: boolean;
  /**
   * With `folders` on, search the folders below the open one too, or the
   * whole scope (`searchScopes`). Turn it off when `authorize` keeps
   * listings to one folder: a search then matches the open folder only.
   * @default true
   */
  recursiveSearch?: boolean;
};

/** Where a search looks. Mirrors react's `ObjectListSearchScope`. */
export type DbObjectSourceSearchScope = "folder" | "all";

/** A folder row of {@link DbObjectSource}. `id` is the folder id. */
export type DbObjectSourceFolder = {
  id: string;
  name: string;
  /**
   * Folders from the root down to the one that holds this folder. Set on
   * the results of a search.
   */
  location?: readonly DbObjectSourceFolder[];
};

/** The `useObjectList` query input. Mirrors react's `ObjectListQueryInput`. */
export type DbObjectSourceQueryInput = {
  /** Folder id. `null` is the root. */
  parent: string | null;
  cursor: string | null;
  /** `name`, `size`, or `updatedAt`. Other fields keep the default order. */
  sort: { field: string; direction: "asc" | "desc" } | null;
  search: string;
  /**
   * `folder`: the open folder and every folder below it. `all`: the whole
   * scope. @default "folder"
   */
  searchScope?: DbObjectSourceSearchScope;
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
  /** Files that match a search, across every page. First page only. */
  total?: number;
};

/** How the list reads one row. Mirrors react's `ObjectListFile`. */
export type DbObjectSourceFile = {
  name: string;
  objectKey: string;
  size: number | null;
  contentType: string | null;
  /** The row's `updatedAt`. */
  updatedAt: string;
  /**
   * Folders from the root down to the row's folder. Set on the rows of a
   * search.
   */
  location?: readonly DbObjectSourceFolder[];
};

/**
 * A `useObjectList` source over `GET /db/objects`. Typed structurally so db
 * does not depend on react; a type test checks it against `ObjectListSource`.
 */
export type DbObjectSource<TClientAttributes = never> = {
  query: (
    input: DbObjectSourceQueryInput,
  ) => Promise<DbObjectSourcePage<TClientAttributes>>;
  getId: (item: DbClientObject<TClientAttributes>) => string;
  getFile: (item: DbClientObject<TClientAttributes>) => DbObjectSourceFile;
  /** `["folder", "all"]` with `folders` on: search reaches every folder. */
  searchScopes?: readonly DbObjectSourceSearchScope[];
  /** Upload options for files dropped into `parent`. The root sends `""`. */
  uploadOptions?: (parent: string | null) => {
    clientMetadata: Record<string, string>;
  };
  /** Creates `name` inside `parent`. */
  createFolder?: (input: {
    parent: string | null;
    name: string;
  }) => Promise<DbObjectSourceFolder>;
  /**
   * Renames a file's `name`. The object `key` stays. Set when `api.db`
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
  /**
   * Moves a file into `parent`. The object `key` stays. Set when `api.db`
   * has `updateObject` and `folders` is on.
   */
  moveFile?: (input: {
    item: DbClientObject<TClientAttributes>;
    parent: string | null;
  }) => Promise<void>;
  /**
   * Moves a folder, with everything in it, into `parent`. Set when
   * `api.db` has `updateFolder` and `folders` is on.
   */
  moveFolder?: (input: {
    folder: DbObjectSourceFolder;
    parent: string | null;
  }) => Promise<void>;
  /**
   * Object keys in a folder and every folder below it, the ones the
   * source's filters list. Set when `folders` is on.
   */
  listFolderKeys?: (input: {
    folder: DbObjectSourceFolder;
    signal: AbortSignal;
  }) => Promise<string[]>;
  /**
   * Removes a folder and the folders below it once their objects are gone.
   * Set when `api.db` has `deleteFolder` and `folders` is on.
   */
  deleteFolder?: (input: { folder: DbObjectSourceFolder }) => Promise<void>;
};
