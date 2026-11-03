"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { APIError } from "@dimah-s3/core";
import { toClientError } from "@/internal/client-error";
import { useControllableState, useLiveRef } from "@/internal/hooks";
import { createObjectListEntries } from "@/list/entries";
import type {
  ObjectListEntry,
  ObjectListFile,
  ObjectListFolder,
  ObjectListSort,
  ObjectListStatus,
  ObjectListUsage,
  UseObjectListOptions,
} from "@/list/types";
import type { UploadRequestOptions } from "@/types/upload";

export type {
  ObjectListEntry,
  ObjectListFile,
  ObjectListFileEntry,
  ObjectListFolder,
  ObjectListFolderEntry,
  ObjectListPage,
  ObjectListQuery,
  ObjectListQueryInput,
  ObjectListSort,
  ObjectListSortDirection,
  ObjectListSource,
  ObjectListStatus,
  ObjectListUsage,
  UseObjectListOptions,
} from "@/list/types";

type FetchMode = "replace" | "append" | "refresh";

/** A value, or an updater from the current value. */
type Updater<T> = T | ((current: T) => T);

/** State and commands returned by {@link useObjectList}. */
export type UseObjectListReturn<TItem> = {
  /** Folders, then files. Rows, tiles, and selection read this. */
  entries: readonly ObjectListEntry<TItem>[];
  items: readonly TItem[];
  /** Child folders from the latest first page. */
  folders: readonly ObjectListFolder[];
  /** Path from the root, root excluded. */
  trail: readonly ObjectListFolder[];
  /** Open folder id. `null` is the root. */
  parent: string | null;
  sort: ObjectListSort | null;
  /** Search text as typed. The query receives it trimmed. */
  search: string;
  /**
   * Totals from the latest page that sent them. `null` when the source
   * did not.
   */
  usage: ObjectListUsage | null;
  error: APIError | null;
  status: ObjectListStatus;
  /** True while the first page is in flight and there is nothing to show. */
  isLoading: boolean;
  /** True while a reload, sort, or search is in flight; rows stay visible. */
  isRefreshing: boolean;
  /** True while a later page is in flight. */
  isLoadingMore: boolean;
  hasMore: boolean;
  nextCursor: string | null;
  /** Load the next page. Ignored while another request is in flight. */
  loadMore: () => Promise<void>;
  /**
   * Reload every page loaded so far, keeping the rows on screen until the
   * new ones arrive.
   */
  refresh: () => Promise<void>;
  /** Repeat the request that failed: the next page, or a reload. */
  retry: () => Promise<void>;
  /** Open a child folder and load its first page. */
  openFolder: (folder: ObjectListFolder) => void;
  /** Replace the path. Pass `[]` for the root. */
  navigate: (trail: readonly ObjectListFolder[]) => void;
  /** Open the parent of the current folder. Does nothing at the root. */
  goUp: () => void;
  /** Change the order. Reloads the first page. */
  setSort: (sort: ObjectListSort | null) => void;
  /** Change the search text. Reloads the first page. Debounce it yourself. */
  setSearch: (search: string) => void;
  /**
   * Edit the loaded files without a request, for example after a rename.
   * The next reload replaces them.
   */
  setItems: (items: Updater<readonly TItem[]>) => void;
  /** Edit the loaded folders without a request. */
  setFolders: (folders: Updater<readonly ObjectListFolder[]>) => void;
  /** Drop loaded files by `getKey`. */
  removeItems: (keys: readonly string[]) => void;
  /** The `getKey` option. */
  getKey: (item: TItem) => string;
  /** The `getFile` option, or `{ name: getKey(item) }`. */
  getFile: (item: TItem) => ObjectListFile;
  /** The source's `uploadOptions`. Set when it supports drop-on-folder. */
  uploadOptions: ((parent: string | null) => UploadRequestOptions) | undefined;
  /**
   * Creates an empty folder in the open folder and adds it to the loaded
   * folders. Rejects with an `APIError`. Set when the source has
   * `createFolder`.
   */
  createFolder: ((name: string) => Promise<ObjectListFolder>) | undefined;
};

/** Rows loaded for one request. */
type Snapshot<TItem> = {
  /** Folder, sort, search, and `queryKey` the rows belong to. */
  key: string | null;
  /** Folder and `queryKey` the rows belong to. */
  scope: string | null;
  items: readonly TItem[];
  folders: readonly ObjectListFolder[];
  nextCursor: string | null;
  usage: ObjectListUsage | null;
  /** Pages loaded for `key`. `refresh` reloads this many. */
  pageCount: number;
};

type State<TItem> = {
  snapshot: Snapshot<TItem>;
  /** Request in flight for `snapshot.key`, if any. */
  pending: FetchMode | null;
  /** Last failure for `snapshot.key`, and what failed. */
  failure: { mode: FetchMode; error: APIError } | null;
};

type Request = {
  key: string;
  scope: string;
  parent: string | null;
  sort: ObjectListSort | null;
  search: string;
};

const EMPTY_SNAPSHOT: Snapshot<never> = {
  key: null,
  scope: null,
  items: [],
  folders: [],
  nextCursor: null,
  usage: null,
  pageCount: 0,
};

const INITIAL_STATE: State<never> = {
  snapshot: EMPTY_SNAPSHOT,
  pending: null,
  failure: null,
};

/**
 * Page through a folder catalog without knowing the backend.
 *
 * Pass a source: `query` loads one page for a folder, cursor, sort, and
 * search; `getKey` and `getFile` read a row. `dbObjectSource` from
 * `@dimah-s3/db/client` and `memoryObjectSource` are ready-made sources;
 * a route handler is another. The hook never calls S3.
 *
 * ```ts
 * const list = useObjectList({
 *   query: ({ parent, cursor, sort, search, signal }) =>
 *     fetchFiles({ folderId: parent, cursor, sort, search, signal }),
 *   getKey: (file) => file.id,
 *   getFile: (file) => ({ name: file.name, objectKey: file.key, size: file.size }),
 * });
 * ```
 *
 * Changing the folder or `queryKey` clears the rows and shows the loading
 * state. Changing the sort or search keeps the rows on screen until the new
 * first page arrives.
 */
export function useObjectList<TItem>(
  options: UseObjectListOptions<TItem>,
): UseObjectListReturn<TItem> {
  const optionsRef = useLiveRef(options);
  const enabled = options.enabled !== false;

  // ── Navigation ────────────────────────────────────────────────────────
  const [parent, setParent] = useControllableState<string | null>(
    options.parent,
    () =>
      options.defaultParent !== undefined
        ? options.defaultParent
        : (options.defaultTrail?.at(-1)?.id ?? null),
    options.onParentChange,
  );
  const [trailState, setTrailState] = useState<readonly ObjectListFolder[]>(
    () => options.defaultTrail ?? [],
  );
  const trail = useMemo(
    () => syncTrail(trailState, parent),
    [trailState, parent],
  );
  const [sort, setSortValue] = useControllableState<ObjectListSort | null>(
    options.sort,
    () => options.defaultSort ?? null,
    options.onSortChange,
    sortsEqual,
  );
  const [search, setSearchValue] = useControllableState<string>(
    options.search,
    () => options.defaultSearch ?? "",
    options.onSearchChange,
  );

  const queryKey = JSON.stringify(options.queryKey ?? []);
  const trimmedSearch = search.trim();
  const request = useMemo<Request>(() => {
    const scope = JSON.stringify([queryKey, parent]);
    return {
      key: JSON.stringify([
        scope,
        sort ? `${sort.field}:${sort.direction}` : "",
        trimmedSearch,
      ]),
      scope,
      parent,
      sort,
      search: trimmedSearch,
    };
  }, [parent, queryKey, sort, trimmedSearch]);
  const requestRef = useLiveRef(request);
  const trailRef = useLiveRef(trail);

  // ── Data ──────────────────────────────────────────────────────────────
  const [state, setState] = useState<State<TItem>>(INITIAL_STATE);
  // Mirrors `state` synchronously so commands that run back to back (an
  // observer and a click) read what the previous one committed.
  const stateRef = useRef<State<TItem>>(INITIAL_STATE);
  const update = useCallback(
    (next: (current: State<TItem>) => State<TItem>) => {
      stateRef.current = next(stateRef.current);
      setState(stateRef.current);
    },
    [],
  );
  const abortRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);

  const run = useCallback(
    async (requested: FetchMode) => {
      const opts = optionsRef.current;
      if (opts.enabled === false) return;
      const target = requestRef.current;
      const current = stateRef.current;
      const sameKey = current.snapshot.key === target.key;
      const mode: FetchMode =
        requested === "refresh" && !sameKey ? "replace" : requested;

      if (mode === "append") {
        if (!sameKey || !current.snapshot.nextCursor || current.pending) return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const generation = ++generationRef.current;
      const isCurrent = () =>
        generation === generationRef.current && !controller.signal.aborted;

      update((draft) => ({ ...draft, pending: mode, failure: null }));
      const input = {
        parent: target.parent,
        sort: target.sort,
        search: target.search,
        signal: controller.signal,
      };

      try {
        if (mode === "append") {
          const page = await opts.query({
            ...input,
            cursor: current.snapshot.nextCursor,
          });
          if (!isCurrent()) return;
          update((draft) => ({
            pending: null,
            failure: null,
            snapshot: {
              ...draft.snapshot,
              items: [...draft.snapshot.items, ...page.items],
              nextCursor: page.nextCursor || null,
              usage: page.usage ?? draft.snapshot.usage,
              pageCount: draft.snapshot.pageCount + 1,
            },
          }));
          return;
        }

        // A reload fetches as many pages as were on screen, then swaps
        // them in at once.
        const pageTarget =
          mode === "refresh" ? Math.max(1, current.snapshot.pageCount) : 1;
        const items: TItem[] = [];
        let folders: readonly ObjectListFolder[] = [];
        let serverTrail: readonly ObjectListFolder[] | undefined;
        let usage: ObjectListUsage | null = null;
        let cursor: string | null = null;
        let pageCount = 0;
        do {
          const page = await opts.query({ ...input, cursor });
          if (!isCurrent()) return;
          if (pageCount === 0) {
            folders = page.folders ?? [];
            if (page.trail) serverTrail = page.trail;
          }
          for (const item of page.items) items.push(item);
          usage = page.usage ?? usage;
          cursor = page.nextCursor || null;
          pageCount += 1;
        } while (cursor && pageCount < pageTarget);

        update(() => ({
          pending: null,
          failure: null,
          snapshot: {
            key: target.key,
            scope: target.scope,
            items,
            folders,
            nextCursor: cursor,
            usage,
            pageCount,
          },
        }));
        if (
          serverTrail &&
          (target.parent === null
            ? serverTrail.length === 0
            : serverTrail.at(-1)?.id === target.parent)
        ) {
          trailRef.current = serverTrail;
          setTrailState(serverTrail);
        }
      } catch (err) {
        if (!isCurrent()) return;
        const error = toClientError(err);
        update((draft) => ({
          pending: null,
          failure: { mode, error },
          // A failed first page shows the error, not the previous rows.
          snapshot:
            mode === "replace"
              ? { ...EMPTY_SNAPSHOT, key: target.key, scope: target.scope }
              : draft.snapshot,
        }));
      }
    },
    [optionsRef, requestRef, trailRef, update],
  );

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    // One microtask: a Strict Mode remount cancels before the request starts.
    void Promise.resolve().then(() => {
      if (active) void run("replace");
    });
    return () => {
      active = false;
      abortRef.current?.abort();
      generationRef.current += 1;
      if (stateRef.current.pending) {
        update((draft) => ({ ...draft, pending: null }));
      }
    };
  }, [enabled, request.key, run, update]);

  // ── Commands ──────────────────────────────────────────────────────────
  const navigate = useCallback(
    (nextTrail: readonly ObjectListFolder[]) => {
      const nextParent = nextTrail.at(-1)?.id ?? null;
      if (
        nextParent === requestRef.current.parent &&
        trailsEqual(nextTrail, trailRef.current)
      ) {
        return;
      }
      trailRef.current = nextTrail;
      setTrailState(nextTrail);
      if (nextParent !== requestRef.current.parent) {
        setSearchValue("");
        setParent(nextParent);
      }
    },
    [requestRef, setParent, setSearchValue, trailRef],
  );

  const openFolder = useCallback(
    (folder: ObjectListFolder) => {
      const current = trailRef.current;
      const index = current.findIndex((entry) => entry.id === folder.id);
      navigate(index >= 0 ? current.slice(0, index + 1) : [...current, folder]);
    },
    [navigate, trailRef],
  );

  const goUp = useCallback(() => {
    if (trailRef.current.length > 0) navigate(trailRef.current.slice(0, -1));
  }, [navigate, trailRef]);

  const loadMore = useCallback(() => run("append"), [run]);
  const refresh = useCallback(() => run("refresh"), [run]);
  const retry = useCallback(
    () =>
      run(stateRef.current.failure?.mode === "append" ? "append" : "refresh"),
    [run],
  );

  const editSnapshot = useCallback(
    (edit: (snapshot: Snapshot<TItem>) => Snapshot<TItem>) => {
      update((draft) =>
        draft.snapshot.key == null
          ? draft
          : { ...draft, snapshot: edit(draft.snapshot) },
      );
    },
    [update],
  );
  const setItems = useCallback(
    (next: Updater<readonly TItem[]>) =>
      editSnapshot((snapshot) => ({
        ...snapshot,
        items: typeof next === "function" ? next(snapshot.items) : next,
      })),
    [editSnapshot],
  );
  const setFolders = useCallback(
    (next: Updater<readonly ObjectListFolder[]>) =>
      editSnapshot((snapshot) => ({
        ...snapshot,
        folders: typeof next === "function" ? next(snapshot.folders) : next,
      })),
    [editSnapshot],
  );
  const removeItems = useCallback(
    (keys: readonly string[]) => {
      if (keys.length === 0) return;
      const drop = new Set(keys);
      const { getKey: keyOf } = optionsRef.current;
      setItems((items) => items.filter((item) => !drop.has(keyOf(item))));
    },
    [optionsRef, setItems],
  );
  const createFolder = useCallback(
    async (name: string) => {
      const create = optionsRef.current.createFolder;
      if (!create) {
        throw new Error("[dimah-s3] The source has no createFolder.");
      }
      const { parent: target, scope } = requestRef.current;
      let folder: ObjectListFolder;
      try {
        folder = await create({ parent: target, name });
      } catch (err) {
        throw toClientError(err);
      }
      // Skip the insert when the list moved to another folder meanwhile.
      update((draft) =>
        draft.snapshot.scope === scope
          ? {
              ...draft,
              snapshot: {
                ...draft.snapshot,
                folders: [
                  ...draft.snapshot.folders.filter(
                    (entry) => entry.id !== folder.id,
                  ),
                  folder,
                ],
              },
            }
          : draft,
      );
      return folder;
    },
    [optionsRef, requestRef, update],
  );
  const setSort = useCallback(
    (next: ObjectListSort | null) => setSortValue(next),
    [setSortValue],
  );
  const setSearch = useCallback(
    (next: string) => setSearchValue(next),
    [setSearchValue],
  );

  // ── View ──────────────────────────────────────────────────────────────
  const { getKey, getFile: readFile } = options;
  const getFile = useMemo(
    () =>
      readFile ?? ((item: TItem): ObjectListFile => ({ name: getKey(item) })),
    [getKey, readFile],
  );
  const { snapshot, pending, failure } = state;
  const fresh = snapshot.key === request.key;
  // A new sort or search keeps the previous rows of the same folder.
  const visible =
    fresh || (snapshot.key != null && snapshot.scope === request.scope);
  const items = visible ? snapshot.items : EMPTY_SNAPSHOT.items;
  const folders = visible ? snapshot.folders : EMPTY_SNAPSHOT.folders;
  const hasRows = items.length > 0 || folders.length > 0;
  const status = readStatus({
    enabled,
    fresh,
    visible,
    hasRows,
    pending,
    failure,
  });
  const entries = useMemo(
    () => createObjectListEntries(folders, items, getKey, getFile),
    [folders, getFile, getKey, items],
  );
  const nextCursor = fresh ? snapshot.nextCursor : null;

  return {
    entries,
    items,
    folders,
    trail,
    parent,
    sort,
    search,
    usage: visible ? snapshot.usage : null,
    error: fresh ? (failure?.error ?? null) : null,
    status,
    isLoading: status === "loading",
    isRefreshing: status === "refreshing",
    isLoadingMore: status === "loading-more",
    hasMore: nextCursor != null,
    nextCursor,
    loadMore,
    refresh,
    retry,
    openFolder,
    navigate,
    goUp,
    setSort,
    setSearch,
    setItems,
    setFolders,
    removeItems,
    getKey,
    getFile,
    uploadOptions: options.uploadOptions,
    createFolder: options.createFolder ? createFolder : undefined,
  };
}

function readStatus({
  enabled,
  fresh,
  visible,
  hasRows,
  pending,
  failure,
}: {
  enabled: boolean;
  fresh: boolean;
  visible: boolean;
  hasRows: boolean;
  pending: FetchMode | null;
  failure: State<unknown>["failure"];
}): ObjectListStatus {
  if (!enabled) return "idle";
  if (!fresh) return visible && hasRows ? "refreshing" : "loading";
  if (pending === "append") return "loading-more";
  if (pending === "replace") return "loading";
  if (pending === "refresh") return hasRows ? "refreshing" : "loading";
  return failure ? "error" : "ready";
}

function sortsEqual(a: ObjectListSort | null, b: ObjectListSort | null) {
  return a === b || (a?.field === b?.field && a?.direction === b?.direction);
}

function trailsEqual(
  a: readonly ObjectListFolder[],
  b: readonly ObjectListFolder[],
): boolean {
  return (
    a.length === b.length &&
    a.every((folder, index) => {
      const other = b[index];
      return (
        other != null && folder.id === other.id && folder.name === other.name
      );
    })
  );
}

/** The trail up to `parent`. An unknown `parent` gets a one-folder trail. */
function syncTrail(
  trail: readonly ObjectListFolder[],
  parent: string | null,
): readonly ObjectListFolder[] {
  if (parent == null) return [];
  if (trail.at(-1)?.id === parent) return trail;
  const index = trail.findIndex((folder) => folder.id === parent);
  if (index >= 0) return trail.slice(0, index + 1);
  return [{ id: parent, name: parent }];
}
