import type { UploadRequestOptions } from "@/types/upload";

/**
 * Bytes and file count for the catalog, with the caps the server enforces.
 * Scope-wide when the source is `dbObjectSource`. A custom query can use the
 * same shape for its own totals.
 */
export type ObjectListUsage = {
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
};

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
   * Falls back to the item key from `getKey`.
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
  /** Trimmed search text. Empty when nothing is searched. */
  search: string;
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
  /** `null` or omit when this is the last page. */
  nextCursor?: string | null;
  /**
   * Totals for the catalog. A later page may omit this; the hook keeps the
   * previous value. A first page that omits it clears the usage line.
   */
  usage?: ObjectListUsage;
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
  /** Stable id for a file row. Unique among the files of one listing. */
  getKey: (item: TItem) => string;
  /**
   * Name, object key, size, and the other fields the UI shows.
   * Keep it pure. Defaults to `{ name: getKey(item) }`.
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
};

/** A file row in {@link ObjectListEntry} order. */
export type ObjectListFileEntry<TItem> = {
  kind: "file";
  /** Unique across files and folders. Selection uses it. */
  key: string;
  /** `getKey(item)`. */
  id: string;
  name: string;
  item: TItem;
  /** `getFile(item)`. */
  file: ObjectListFile;
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
  /**
   * Extra identity for the first-page fetch, such as a route or a filter.
   * Changing it clears the rows and loads again. JSON-serializable. The
   * folder, sort, and search are already included.
   */
  queryKey?: readonly unknown[];
  /** When false, do not fetch. @default true */
  enabled?: boolean;
};
