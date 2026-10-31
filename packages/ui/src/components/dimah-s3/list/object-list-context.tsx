"use client";

import { createContext, useContext, type ReactNode } from "react";
import type {
  AnyDownloadReturn,
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

/** Per-entry render hooks. Each returns the default when left out. */
export type ObjectListRenderers<TItem> = {
  /** Replaces the whole row or tile. Compose `ObjectListRow` or `ObjectListTile` to keep selection. */
  renderEntry?: (entry: ObjectListEntry<TItem>) => ReactNode;
  /**
   * Trailing controls. Defaults to `ObjectListItemMenu` on files when the
   * list has `download`, `share`, or `delete`, and on folders when files
   * can be uploaded into them. Return `null` to hide them.
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
  loadMore: "auto" | "button";
  onOpenItem: ((item: TItem) => void) | undefined;
  /** Object keys stored in a folder. Lets bulk delete include folders. */
  resolveFolderKeys:
    ((folder: ObjectListFolder) => Promise<readonly string[]>) | undefined;
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
