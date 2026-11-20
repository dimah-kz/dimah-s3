import type { UploadRequestOptions } from "@/types/upload";

/**
 * Bytes and file count for the catalog, with the caps the server enforces.
 * Scope-wide when the source is `dbObjectSource`. A custom query can use the
 * same shape for its own totals.
 */
export type ObjectListUsageData = {
  totalBytes: number;
  objectCount: number;
  /** Byte cap. Omit when there is none. */
  maxBytes?: number;
  /** File-count cap. Omit when there is none. */
  maxFiles?: number;
};

/** One folder the catalog can open. `id` is opaque to the hook. */
export type ObjectListFolder = {
  /** Sent back as `parent` when this folder is opened. */
  id: string;
  /** Label for the row and the breadcrumb. */
  name: string;
  /**
   * Folders from the root down to the one that holds this folder, root
   * excluded. Set it on the results of a search that reaches other
   * folders: the row shows where it lives, and opening it opens the whole
   * path.
   */
  location?: readonly ObjectListFolder[];
};

/**
 * Where a search looks.
 * - `folder`: the open folder and every folder below it.
 * - `all`: every folder.
 *
 * At the root both cover everything.
 */
export type ObjectListSearchScope = "folder" | "all";

/**
 * What the list knows about one file. `getFile` reads it from your item.
 * Only `name` is required; the rest fills the default row, tile, menu, and
 * bulk actions when present.
 */
export type ObjectListFile = {
  /** Label, accessible name, and the name the type glyph reads. */
  name: string;
  /**
   * Stored S3 object key. Download, Copy link, and Delete use it.
   * Falls back to the item key from `getId`.
   */
  objectKey?: string | null;
  /** Size in bytes. */
  size?: number | null;
  /** MIME type. Picks the glyph when the name has no extension. */
  contentType?: string | null;
  /** Last change: a `Date`, an ISO string, or epoch milliseconds. */
  updatedAt?: Date | string | number | null;
  /** Image thumbnail. The name stays the accessible label. */
  previewUrl?: string | null;
  /**
   * Folders from the root down to the one that holds the file, root
   * excluded. Set it on the results of a search that reaches other
   * folders: the row shows where the file lives and offers to open there.
   */
  location?: readonly ObjectListFolder[] | null;
};

export type ObjectListSortDirection = "asc" | "desc";

/**
 * Sort order sent to the query. `field` is opaque to the hook. The UI has
 * labels for `name`, `size`, and `updatedAt`.
 */
export type ObjectListSort = {
  field: string;
  direction: ObjectListSortDirection;
};

/** Arguments for one page of {@link ObjectListQuery}. */
export type ObjectListQueryInput = {
  /** Current folder id. `null` is the root. */
  parent: string | null;
  /** Cursor from the previous page. `null` on the first page. */
  cursor: string | null;
  /** Requested order. `null` leaves the order to the source. */
  sort: ObjectListSort | null;
  /**
   * Trimmed search text. Empty when nothing is searched, also when the
   * text has only joiners or accents (`normalizeSearchText` from
   * `@dimah-s3/core` folds it to nothing).
   */
  search: string;
  /**
   * Where `search` looks. Only means something while `search` is set; a
   * source without `searchScopes` can ignore it.
   */
  searchScope: ObjectListSearchScope;
  /**
   * Aborted when the folder, sort, search, or `queryKey` changes, when the
   * list refreshes, or when the hook unmounts.
   */
  signal: AbortSignal;
};

/** One page returned by an {@link ObjectListQuery}. */
export type ObjectListPage<TItem> = {
  items: readonly TItem[];
  /**
   * Child folders at this level. Read from the first page only.
   * Omit when the source has no folders.
   */
  folders?: readonly ObjectListFolder[];
  /**
   * Folders from the root down to `parent`. When the first page includes
   * it, the hook shows these names in the breadcrumb. Omit it to keep the
   * trail the hook built while navigating.
   */
  trail?: readonly ObjectListFolder[];
  /** `null` or omit when this is the last page. */
  nextCursor?: string | null;
  /**
   * Totals for the catalog. A later page may omit this; the hook keeps the
   * previous value. A first page that omits it clears the usage line.
   */
  usage?: ObjectListUsageData;
  /**
   * Files that match the search, across every page. Read from the first
   * page. Omit it and the result count says how many have loaded.
   */
  total?: number;
};

/**
 * Loads one page. The hook does not know where rows live: a database
 * plugin, a route handler, or an in-memory list.
 */
export type ObjectListQuery<TItem> = (
  input: ObjectListQueryInput,
) => Promise<ObjectListPage<TItem>>;

/**
 * Where the rows come from and how to read one.
 * `dbObjectSource` and `memoryObjectSource` return this shape, so it can be
 * spread straight into `useObjectList`.
 */
export type ObjectListSource<TItem> = {
  query: ObjectListQuery<TItem>;
  /**
   * The `searchScope` values the query understands. With both, the search
   * bar offers "this folder" and "everywhere" while a folder is open. Omit
   * it for a query that searches one way.
   */
  searchScopes?: readonly ObjectListSearchScope[];
  /** Stable id for a file row. Unique among the files of one listing. */
  getId: (item: TItem) => string;
  /**
   * Name, object key, size, and the other fields the UI shows.
   * Keep it pure. Defaults to `{ name: getId(item) }`.
   */
  getFile?: (item: TItem) => ObjectListFile;
  /**
   * Request options for files uploaded into `parent` (`null` is the root).
   * Enables drop-on-folder.
   */
  uploadOptions?: (parent: string | null) => UploadRequestOptions;
  /** Creates an empty folder. Enables "New folder". */
  createFolder?: (input: {
    parent: string | null;
    name: string;
  }) => Promise<ObjectListFolder>;
  /**
   * Renames a file's display name. The object key stays whatever you store.
   * Enables Rename on file rows. Return the updated item and the row
   * changes at once; omit it and the list reloads.
   */
  renameFile?: (input: { item: TItem; name: string }) => Promise<TItem | void>;
  /**
   * Renames a folder. Enables Rename on folder rows. Return the folder
   * (`id` and `name`) and the row and breadcrumb update at once; omit it
   * and the list reloads. Keep `id` stable when the folder's identity is.
   */
  renameFolder?: (input: {
    folder: ObjectListFolder;
    name: string;
  }) => Promise<ObjectListFolder | void>;
};

/** A folder row in {@link ObjectListEntry} order. */
export type ObjectListFolderEntry = {
  kind: "folder";
  /** Unique across files and folders. Selection uses it. */
  key: string;
  /** The folder id. */
  id: string;
  name: string;
  folder: ObjectListFolder;
  /** `folder.location`: where a search result lives. */
  location?: readonly ObjectListFolder[];
};

/** A file row in {@link ObjectListEntry} order. */
export type ObjectListFileEntry<TItem> = {
  kind: "file";
  /** Unique across files and folders. Selection uses it. */
  key: string;
  /** `getId(item)`. */
  id: string;
  name: string;
  item: TItem;
  /** `getFile(item)`. */
  file: ObjectListFile;
  /** `file.location`: where a search result lives. */
  location?: readonly ObjectListFolder[];
};

/** Folders first, then files, in the order the query returned them. */
export type ObjectListEntry<TItem> =
  ObjectListFolderEntry | ObjectListFileEntry<TItem>;

/**
 * - `idle`: `enabled` is false.
 * - `loading`: the first page is in flight and there is nothing to show.
 * - `refreshing`: a reload, sort, or search is in flight; current rows stay.
 * - `loading-more`: the next page is in flight.
 * - `error`: the last request failed. Rows that loaded before stay.
 */
export type ObjectListStatus =
  "idle" | "loading" | "refreshing" | "loading-more" | "ready" | "error";

/** Options for `useObjectList`. */
export type UseObjectListOptions<TItem> = ObjectListSource<TItem> & {
  /**
   * Folder id. Pass it with `onParentChange` to control navigation
   * (for example from the URL). Omit both and the hook owns the folder.
   * `null` is a controlled root — it is not the same as omitting `parent`.
   */
  parent?: string | null;
  onParentChange?: (parent: string | null) => void;
  /** Uncontrolled starting folder. Ignored when `parent` is set. */
  defaultParent?: string | null;
  /**
   * Starting path, root excluded. Labels the breadcrumb. When
   * `defaultParent` or `parent` is also set, the last id should be that folder.
   */
  defaultTrail?: readonly ObjectListFolder[];
  /**
   * Controlled order. Pass it with `onSortChange`. `null` is a controlled
   * "source order".
   */
  sort?: ObjectListSort | null;
  onSortChange?: (sort: ObjectListSort | null) => void;
  /** Uncontrolled starting order. @default null */
  defaultSort?: ObjectListSort | null;
  /** Controlled search text. Pass it with `onSearchChange`. */
  search?: string;
  onSearchChange?: (search: string) => void;
  /** Uncontrolled starting search text. @default "" */
  defaultSearch?: string;
  /** Controlled search scope. Pass it with `onSearchScopeChange`. */
  searchScope?: ObjectListSearchScope;
  onSearchScopeChange?: (scope: ObjectListSearchScope) => void;
  /** Uncontrolled starting search scope. @default "folder" */
  defaultSearchScope?: ObjectListSearchScope;
  /**
   * Extra identity for the first-page fetch, such as a route or a filter.
   * Changing it clears the rows and loads again. JSON-serializable. The
   * folder, sort, and search are already included.
   */
  queryKey?: readonly unknown[];
  /** When false, do not fetch. @default true */
  enabled?: boolean;
};
