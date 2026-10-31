"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLiveRef } from "@/internal/hooks";
import type { ObjectListEntry, ObjectListFolder } from "@/list/types";

export type ObjectListSelectionMode = "single" | "multiple";

/** Options for {@link useObjectListSelection}. */
export type UseObjectListSelectionOptions<TItem> = {
  /** `single` keeps at most one entry. @default "multiple" */
  mode?: ObjectListSelectionMode;
  /**
   * Which entries can be selected. Defaults to files only: a folder needs
   * its object keys before a bulk action can act on it.
   */
  isSelectable?: (entry: ObjectListEntry<TItem>) => boolean;
  /**
   * Keep the selection when the folder changes. Entries that leave the
   * loaded rows stay selected, as in a file picker that collects files from
   * several folders. @default false
   */
  persist?: boolean;
  /** Called when the selected entries change, including when they clear. */
  onSelectionChange?: (selected: readonly ObjectListEntry<TItem>[]) => void;
};

/** State and commands returned by {@link useObjectListSelection}. */
export type UseObjectListSelectionReturn<TItem> = {
  mode: ObjectListSelectionMode;
  persist: boolean;
  /** Selected entries in the order they were selected. */
  selected: readonly ObjectListEntry<TItem>[];
  /** `entry.key` of each selected entry. */
  selectedKeys: ReadonlySet<string>;
  selectedItems: readonly TItem[];
  selectedFolders: readonly ObjectListFolder[];
  count: number;
  /** At least one entry is selected. */
  isSelecting: boolean;
  /** Every selectable loaded entry is selected. */
  allSelected: boolean;
  /** Loaded entries that can be selected. */
  selectableCount: number;
  isSelected: (key: string) => boolean;
  canSelect: (entry: ObjectListEntry<TItem>) => boolean;
  /**
   * Flip one entry, or set it with `value`. `range` applies the same value
   * to every selectable entry between the last toggled entry and this one.
   */
  toggle: (key: string, options?: { range?: boolean; value?: boolean }) => void;
  /** Add loaded entries. In `single` mode the last key wins. */
  select: (keys: string | readonly string[]) => void;
  deselect: (keys: string | readonly string[]) => void;
  /** Select every selectable loaded entry. Ignored in `single` mode. */
  selectAll: () => void;
  clear: () => void;
};

/** The parts of a `useObjectList` return the selection reads. */
type SelectionSource<TItem> = {
  entries: readonly ObjectListEntry<TItem>[];
  parent: string | null;
};

type State<TItem> = {
  /** Folder the selection belongs to. Always `""` with `persist`. */
  scope: string;
  selected: ReadonlyMap<string, ObjectListEntry<TItem>>;
  /** Last entry toggled on its own. Range selection starts here. */
  anchor: string | null;
};

function selectFiles(entry: ObjectListEntry<unknown>) {
  return entry.kind === "file";
}

/**
 * Checkbox selection over the rows of a `useObjectList` return.
 * Headless: render your own checkboxes, or pass it to `ObjectList` as
 * `selection`.
 *
 * ```ts
 * const list = useObjectList(source);
 * const selection = useObjectListSelection(list);
 *
 * selection.toggle(entry.key, { range: event.shiftKey });
 * selection.selectedItems; // the files to act on
 * ```
 *
 * Without `persist`, the selection follows the loaded rows: it clears when
 * the folder changes and drops entries a reload no longer returns.
 */
export function useObjectListSelection<TItem>(
  list: SelectionSource<TItem>,
  options: UseObjectListSelectionOptions<TItem> = {},
): UseObjectListSelectionReturn<TItem> {
  const mode = options.mode ?? "multiple";
  const persist = options.persist === true;
  const canSelect = options.isSelectable ?? selectFiles;
  const scope = persist ? "" : JSON.stringify(list.parent);

  const [stored, setStored] = useState<State<TItem>>(() => ({
    scope,
    selected: new Map(),
    anchor: null,
  }));
  // Another folder starts empty. Reset here, not in an effect, so the old
  // selection never renders against the new rows.
  let state = stored;
  if (stored.scope !== scope) {
    state = { scope, selected: new Map(), anchor: null };
    setStored(state);
  }

  const loaded = useMemo(
    () => new Map(list.entries.map((entry) => [entry.key, entry])),
    [list.entries],
  );
  const selectable = useMemo(
    () => list.entries.filter((entry) => canSelect(entry)),
    [canSelect, list.entries],
  );
  const selected = useMemo(() => {
    const result: ObjectListEntry<TItem>[] = [];
    for (const [key, entry] of state.selected) {
      const current = loaded.get(key);
      if (current) result.push(current);
      else if (persist) result.push(entry);
    }
    return result;
  }, [loaded, persist, state.selected]);

  const live = useLiveRef({
    mode,
    persist,
    scope,
    loaded,
    selectable,
    canSelect,
  });
  const optionsRef = useLiveRef(options);
  const selectedRef = useLiveRef(selected);

  /** What is selected now, keyed by entry, before an edit. */
  const baseOf = useCallback(
    (previous: State<TItem>) => {
      const next = new Map<string, ObjectListEntry<TItem>>();
      if (previous.scope !== live.current.scope) return next;
      for (const [key, entry] of previous.selected) {
        const current = live.current.loaded.get(key);
        if (current) next.set(key, current);
        else if (live.current.persist) next.set(key, entry);
      }
      return next;
    },
    [live],
  );

  const toggle = useCallback(
    (key: string, toggleOptions: { range?: boolean; value?: boolean } = {}) => {
      const { canSelect: allowed, loaded: rows, mode: current } = live.current;
      const entry = rows.get(key);
      if (!entry || !allowed(entry)) return;
      setStored((previous) => {
        const base = baseOf(previous);
        const value = toggleOptions.value ?? !base.has(key);
        const next: State<TItem> = {
          scope: live.current.scope,
          selected: base,
          anchor: key,
        };
        if (current === "single") {
          return { ...next, selected: new Map(value ? [[key, entry]] : []) };
        }
        const range = toggleOptions.range
          ? rangeBetween(live.current.selectable, previous.anchor, key)
          : null;
        if (range) {
          for (const item of range) {
            if (value) base.set(item.key, item);
            else base.delete(item.key);
          }
          return { ...next, anchor: previous.anchor };
        }
        if (value) base.set(key, entry);
        else base.delete(key);
        return next;
      });
    },
    [baseOf, live],
  );

  const select = useCallback(
    (keys: string | readonly string[]) => {
      const { canSelect: allowed, loaded: rows, mode: current } = live.current;
      const entries = toKeys(keys).flatMap((key) => {
        const entry = rows.get(key);
        return entry && allowed(entry) ? [entry] : [];
      });
      if (entries.length === 0) return;
      setStored((previous) => {
        const base = current === "single" ? new Map() : baseOf(previous);
        const picked = current === "single" ? entries.slice(-1) : entries;
        for (const entry of picked) base.set(entry.key, entry);
        return {
          scope: live.current.scope,
          selected: base,
          anchor: picked.at(-1)?.key ?? previous.anchor,
        };
      });
    },
    [baseOf, live],
  );

  const deselect = useCallback(
    (keys: string | readonly string[]) => {
      const drop = toKeys(keys);
      if (drop.length === 0) return;
      setStored((previous) => {
        const base = baseOf(previous);
        for (const key of drop) base.delete(key);
        return { ...previous, scope: live.current.scope, selected: base };
      });
    },
    [baseOf, live],
  );

  const selectAll = useCallback(() => {
    if (live.current.mode === "single") return;
    select(live.current.selectable.map((entry) => entry.key));
  }, [live, select]);

  const clear = useCallback(() => {
    setStored({ scope: live.current.scope, selected: new Map(), anchor: null });
  }, [live]);

  // Notify on a change of keys, not on every render that rebuilds rows.
  const signature = selected.map((entry) => entry.key).join("\0");
  const notifiedRef = useRef(signature);
  useEffect(() => {
    if (notifiedRef.current === signature) return;
    notifiedRef.current = signature;
    optionsRef.current.onSelectionChange?.(selectedRef.current);
  }, [optionsRef, selectedRef, signature]);

  const selectedKeys = useMemo(
    () => new Set(selected.map((entry) => entry.key)),
    [selected],
  );
  const selectedItems = useMemo(
    () =>
      selected.flatMap((entry) => (entry.kind === "file" ? [entry.item] : [])),
    [selected],
  );
  const selectedFolders = useMemo(
    () =>
      selected.flatMap((entry) =>
        entry.kind === "folder" ? [entry.folder] : [],
      ),
    [selected],
  );
  const isSelected = useCallback(
    (key: string) => selectedKeys.has(key),
    [selectedKeys],
  );

  return {
    mode,
    persist,
    selected,
    selectedKeys,
    selectedItems,
    selectedFolders,
    count: selected.length,
    isSelecting: selected.length > 0,
    allSelected:
      selectable.length > 0 &&
      selectable.every((entry) => selectedKeys.has(entry.key)),
    selectableCount: selectable.length,
    isSelected,
    canSelect,
    toggle,
    select,
    deselect,
    selectAll,
    clear,
  };
}

function toKeys(keys: string | readonly string[]): readonly string[] {
  return typeof keys === "string" ? [keys] : keys;
}

/** Selectable entries from `anchor` to `key`, inclusive. */
function rangeBetween<TItem>(
  selectable: readonly ObjectListEntry<TItem>[],
  anchor: string | null,
  key: string,
): readonly ObjectListEntry<TItem>[] | null {
  if (anchor == null) return null;
  const from = selectable.findIndex((entry) => entry.key === anchor);
  const to = selectable.findIndex((entry) => entry.key === key);
  if (from < 0 || to < 0) return null;
  return selectable.slice(Math.min(from, to), Math.max(from, to) + 1);
}
