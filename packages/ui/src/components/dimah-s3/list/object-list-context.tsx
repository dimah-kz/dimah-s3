"use client";

import { createContext, useContext, type ReactNode } from "react";
import type {
  ObjectListEntry,
  ObjectListFolder,
  UseDeleteReturn,
  UseNavigateDownloadReturn,
  UseObjectListReturn,
  UseObjectListSelectionReturn,
  UseUploadReturn,
} from "@dimah-s3/react";

/** `list` draws one row per entry. `grid` draws tiles with larger previews. */
export type ObjectListView = "list" | "grid";

/** Caps for the usage line. The list does not read them from the server. */
export type ObjectListUsageLimits = {
  /**
   * Byte cap. Pass the same number as `db({ quota: { maxBytes } })` when
   * that plugin is what enforces the limit.
   */
  maxBytes?: number;
  /**
   * File-count cap. Pass the same number as `db({ quota: { maxFiles } })`
   * when that plugin is what enforces the limit.
   */
  maxFiles?: number;
};

/** Object keys from one delete: a row menu or the selection bar. */
export type ObjectListDeleteResult = {
  deleted: string[];
  failed: string[];
};

/** Per-entry render hooks. Each returns the default when left out. */
export type ObjectListRenderers<TItem> = {
  /** Replaces the whole row or tile. Compose `ObjectListRow` or `ObjectListTile` to keep selection. */
  renderEntry?: (entry: ObjectListEntry<TItem>) => ReactNode;
  /**
   * Trailing controls. Defaults to `ObjectListItemMenu` on files when the
   * list has `download`, `share`, or `delete`. Return `null` to hide them.
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

/** What `ObjectList` shares with its parts. Read it with {@link useObjectListContext}. */
export type ObjectListContextValue<TItem> = ObjectListRenderers<TItem> & {
  list: UseObjectListReturn<TItem>;
  selection: UseObjectListSelectionReturn<TItem> | null;
  upload: UseUploadReturn | null;
  download: UseNavigateDownloadReturn | null;
  share: UseNavigateDownloadReturn | null;
  remove: UseDeleteReturn | null;
  view: ObjectListView;
  setView: (view: ObjectListView) => void;
  /** Root breadcrumb label and the list's accessible name. */
  label: string;
  /** `fixed` with `height`, `max` with `maxHeight`. Rows scroll inside. */
  sizing: "fixed" | "max" | null;
  showBreadcrumb: boolean;
  selectionActions: ReactNode;
  usageLimits: ObjectListUsageLimits | undefined;
  empty: ReactNode;
  loadMore: "auto" | "button";
  onOpenItem: ((item: TItem) => void) | undefined;
  /** Object keys stored in a folder. Lets bulk delete include folders. */
  resolveFolderKeys:
    ((folder: ObjectListFolder) => Promise<readonly string[]>) | undefined;
  /** Drop deleted files from the rows, reload, and call `onDeleted`. */
  afterDelete: (result: ObjectListDeleteResult) => void;
};

const ObjectListContext = createContext<ObjectListContextValue<unknown> | null>(
  null,
);
const ObjectListEntryContext = createContext<ObjectListEntry<unknown> | null>(
  null,
);

export function ObjectListProvider<TItem>({
  value,
  children,
}: {
  value: ObjectListContextValue<TItem>;
  children: ReactNode;
}) {
  return (
    <ObjectListContext.Provider
      value={value as unknown as ObjectListContextValue<unknown>}
    >
      {children}
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
