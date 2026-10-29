/**
 * Bytes and file count for the catalog.
 * Scope-wide when the source is `listObjects`. A custom query can use the
 * same shape for its own totals.
 */
export type ObjectListUsage = {
  totalBytes: number;
  objectCount: number;
};

/** One folder the catalog can open. `id` is opaque to the hook. */
export type ObjectListFolder = {
  /** Sent back as `parent` when this folder is opened. */
  id: string;
  /** Label for the row and the breadcrumb. */
  name: string;
};

/** Arguments for one page of {@link ObjectListQuery}. */
export type ObjectListQueryInput = {
  /** Current folder id. `null` is the root. */
  parent: string | null;
  /** Cursor from the previous page. `null` on the first page. */
  cursor: string | null;
  /** Aborted when the folder changes, the list refreshes, or the hook unmounts. */
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
   * previous value. A first page, refresh, or folder change that omits it
   * clears the line.
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

/** Options for `useObjectList`. */
export type UseObjectListOptions<TItem> = {
  query: ObjectListQuery<TItem>;
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
   * Uncontrolled starting path, root excluded. When `defaultParent` is also
   * set, the last id should be that folder.
   */
  defaultTrail?: readonly ObjectListFolder[];
  /**
   * Extra identity for the first-page fetch. Changing it clears the list
   * and loads again. JSON-serializable. The folder id is already included.
   */
  queryKey?: readonly unknown[];
  /** When false, do not fetch. @default true */
  enabled?: boolean;
};
