"use client";

import {
  createContext,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type {
  AnyDownloadReturn,
  DropTargetProps,
  ObjectListEntry,
  ObjectListFolder,
  UseDeleteReturn,
  UseDownloadReturn,
  UseObjectListReturn,
  UseObjectListSelectionReturn,
  UseUploadReturn,
} from "@dimah-s3/react";

/** `list` draws one row per entry. `grid` draws tiles with larger previews. */
export type ObjectListView = "list" | "grid";

/** `auto` loads the next page on scroll; `button` waits for Load more. */
export type ObjectListPagination = "auto" | "button";

/** Per-entry render hooks. Each returns the default when left out. */
export type ObjectListRenderers<TItem> = {
  /** Replaces the whole row or tile. Compose `ObjectListRow` or `ObjectListTile` to keep selection. */
  renderEntry?: (entry: ObjectListEntry<TItem>) => ReactNode;
  /**
   * Trailing controls. Defaults to `ObjectListItemMenu` on files when the
   * list has `download`, `share`, `delete`, or `renameFile`, and on folders
   * when files can be uploaded into them or the source has `renameFolder`.
   * Return `null` to hide them.
   */
  renderActions?: (entry: ObjectListEntry<TItem>) => ReactNode;
  /**
   * Second line. Defaults to the size and date of a file. Text only: it
   * sits inside the entry's button. Controls go in `renderActions`.
   */
  renderDescription?: (entry: ObjectListEntry<TItem>) => ReactNode;
  /** Beside the name, such as a status badge. Text only, like the description. */
  renderMeta?: (entry: ObjectListEntry<TItem>) => ReactNode;
};

/** The one-shot result of a list control, such as Copy link. */
export type ObjectListFeedback = {
  type: "success" | "error" | "info";
  title: string;
  description?: ReactNode;
};

/** What `ObjectList` shares with its parts. Read it with {@link useObjectListContext}. */
export type ObjectListContextValue<TItem> = ObjectListRenderers<TItem> & {
  list: UseObjectListReturn<TItem>;
  selection: UseObjectListSelectionReturn<TItem> | null;
  upload: UseUploadReturn | null;
  download: AnyDownloadReturn | null;
  /** Signs Copy link. Falls back to a navigate-mode `download`. */
  share: UseDownloadReturn | null;
  delete: UseDeleteReturn | null;
  /**
   * The list shows toasts. Off, its controls report through `announce`
   * instead.
   */
  toasts: boolean;
  /** Reads `feedback` out in the list's polite live region. */
  announce: (feedback: ObjectListFeedback) => void;
  view: ObjectListView;
  setView: (view: ObjectListView) => void;
  /** Root breadcrumb label and the list's accessible name. */
  label: string;
  /** `fixed` with `height`, `max` with `maxHeight`. Rows scroll inside. */
  sizing: "fixed" | "max" | null;
  showBreadcrumb: boolean;
  selectionActions: ReactNode;
  empty: ReactNode;
  pagination: ObjectListPagination;
  onOpenItem: ((item: TItem) => void) | undefined;
  /** Object keys stored in a folder. Lets bulk delete include folders. */
  resolveFolderKeys:
    ((folder: ObjectListFolder) => Promise<readonly string[]>) | undefined;
  /** Entry key whose name is a field, or `null`. */
  renamingKey: string | null;
  /** Turn that entry's name into the rename field. */
  startRename: (key: string) => void;
  /**
   * Close the rename field of entry `key`, if it is still the one open.
   * With `focus`, the row takes focus once its button is back.
   */
  endRename: (key: string, focus?: boolean) => void;
};

/**
 * What rows, tiles, and their menus read. It changes only when a feature,
 * a renderer, or a command changes, not on every upload tick, so memoized
 * rows skip those renders. Per-entry state comes from `store`. @internal
 */
export type ObjectListEntryScope<TItem> = Omit<
  ObjectListRenderers<TItem>,
  "renderEntry"
> & {
  store: ObjectListEntryStore;
  /**
   * Keys of the entries the selection can select. It changes with the
   * entries, so a new entry draws with its checkbox at once.
   */
  selectable: ReadonlySet<string>;
  /** File rows open: `onOpenItem` is set. */
  opensFiles: boolean;
  /** Files can be uploaded into folder rows. */
  folderUploads: boolean;
  /** The list has `download`. */
  download: boolean;
  /** Copy link can sign: `share`, or a navigate-mode `download`. */
  share: boolean;
  /** The list has `delete`. */
  delete: boolean;
  renameFile: boolean;
  renameFolder: boolean;
  /** Opens a folder in place, or calls `onOpenItem` for a file. */
  open: (entry: ObjectListEntry<TItem>) => void;
  /** `selection.toggle`. */
  toggle: (key: string, options?: { range?: boolean; value?: boolean }) => void;
  /** Drop handlers that upload into folder `id`, with the latest options. */
  folderDropTarget: (id: string) => DropTargetProps;
  startRename: (key: string) => void;
  endRename: (key: string, focus?: boolean) => void;
};

/** State each entry reads by its key. @internal */
export type ObjectListEntryState = {
  selected: ReadonlySet<string>;
  /** Any entry is selected. */
  selecting: boolean;
  /** The entry whose name is a field. */
  renaming: string | null;
  /** The entry whose trigger takes Tab: the last one focused, else the first. */
  tabStop: string | null;
};

/**
 * Holds {@link ObjectListEntryState}. An entry subscribes to its own key,
 * so a selection, a rename, or an arrow key draws only the entries whose
 * state changed. @internal
 */
export type ObjectListEntryStore = {
  get: () => ObjectListEntryState;
  set: (next: Partial<ObjectListEntryState>) => void;
  subscribe: (listener: () => void) => () => void;
};

/** @internal */
export function createObjectListEntryStore(
  initial: ObjectListEntryState,
): ObjectListEntryStore {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(next) {
      const merged = { ...state, ...next };
      const keys = Object.keys(merged) as (keyof ObjectListEntryState)[];
      if (keys.every((key) => Object.is(merged[key], state[key]))) return;
      state = merged;
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

const ObjectListContext = createContext<ObjectListContextValue<unknown> | null>(
  null,
);
const ObjectListEntryScopeContext =
  createContext<ObjectListEntryScope<unknown> | null>(null);
const ObjectListEntryContext = createContext<ObjectListEntry<unknown> | null>(
  null,
);

export function ObjectListProvider<TItem>({
  value,
  scope,
  children,
}: {
  value: ObjectListContextValue<TItem>;
  /** What entries read. Parts that draw no entries can do without it. */
  scope?: ObjectListEntryScope<TItem>;
  children: ReactNode;
}) {
  return (
    <ObjectListContext.Provider
      value={value as unknown as ObjectListContextValue<unknown>}
    >
      <ObjectListEntryScopeContext.Provider
        value={(scope ?? null) as ObjectListEntryScope<unknown> | null}
      >
        {children}
      </ObjectListEntryScopeContext.Provider>
    </ObjectListContext.Provider>
  );
}

export function ObjectListEntryProvider<TItem>({
  entry,
  children,
}: {
  entry: ObjectListEntry<TItem>;
  children: ReactNode;
}) {
  return (
    <ObjectListEntryContext.Provider value={entry as ObjectListEntry<unknown>}>
      {children}
    </ObjectListEntryContext.Provider>
  );
}

/**
 * The list, selection, hooks, and view of the nearest `ObjectList`.
 * Use it to build your own parts.
 */
export function useObjectListContext<
  TItem = unknown,
>(): ObjectListContextValue<TItem> {
  const value = useContext(ObjectListContext);
  if (!value) {
    throw new Error(
      "[dimah-s3] Object list parts must be rendered inside <ObjectList>.",
    );
  }
  return value as unknown as ObjectListContextValue<TItem>;
}

/** Like {@link useObjectListContext}, but `null` outside an `ObjectList`. */
export function useOptionalObjectListContext<
  TItem = unknown,
>(): ObjectListContextValue<TItem> | null {
  return useContext(ObjectListContext) as ObjectListContextValue<TItem> | null;
}

/** The entry a row or tile renders. `null` outside one. */
export function useObjectListEntry<
  TItem = unknown,
>(): ObjectListEntry<TItem> | null {
  return useContext(ObjectListEntryContext) as ObjectListEntry<TItem> | null;
}

/** The nearest list's {@link ObjectListEntryScope}, or `null`. @internal */
export function useOptionalObjectListEntryScope<
  TItem = unknown,
>(): ObjectListEntryScope<TItem> | null {
  return useContext(
    ObjectListEntryScopeContext,
  ) as ObjectListEntryScope<TItem> | null;
}

/** Like {@link useOptionalObjectListEntryScope}, inside a list only. @internal */
export function useObjectListEntryScope<
  TItem = unknown,
>(): ObjectListEntryScope<TItem> {
  const scope = useOptionalObjectListEntryScope<TItem>();
  if (!scope) {
    throw new Error(
      "[dimah-s3] Object list parts must be rendered inside <ObjectList>.",
    );
  }
  return scope;
}

const SELECTED = 1;
const SELECTING = 2;
const RENAMING = 4;
const TAB_STOP = 8;

/** What one entry shows. @internal */
export type ObjectListEntryStatus = {
  selectable: boolean;
  selected: boolean;
  /** Any entry in the list is selected. */
  selecting: boolean;
  renaming: boolean;
  /** This entry's trigger takes Tab. */
  tabStop: boolean;
};

/**
 * The state of entry `key`. Renders again only when that entry's state
 * changes. @internal
 */
export function useObjectListEntryStatus(key: string): ObjectListEntryStatus {
  const { store, selectable } = useObjectListEntryScope();
  const read = () => entryFlags(store.get(), key);
  const flags = useSyncExternalStore(store.subscribe, read, read);
  const canSelect = selectable.has(key);
  return {
    selectable: canSelect,
    selected: canSelect && (flags & SELECTED) !== 0,
    selecting: (flags & SELECTING) !== 0,
    renaming: (flags & RENAMING) !== 0,
    tabStop: (flags & TAB_STOP) !== 0,
  };
}

/** One number per entry, so an unchanged entry reads an equal snapshot. */
function entryFlags(state: ObjectListEntryState, key: string): number {
  return (
    (state.selected.has(key) ? SELECTED : 0) |
    (state.selecting ? SELECTING : 0) |
    (state.renaming === key ? RENAMING : 0) |
    (state.tabStop === key ? TAB_STOP : 0)
  );
}
