"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { APIError } from "@dimah-s3/core";
import { useLiveRef } from "@/internal-helpers";
import type {
  ObjectListFolder,
  ObjectListPage,
  ObjectListUsage,
  UseObjectListOptions,
} from "@/list/types";
import { isAbortError, toHookError } from "@/types/error";

export type {
  ObjectListFolder,
  ObjectListPage,
  ObjectListQuery,
  ObjectListQueryInput,
  ObjectListUsage,
  UseObjectListOptions,
} from "@/list/types";

type Status = "loading" | "loading-more" | "refreshing" | "ready" | "error";
type FetchMode = "replace" | "append" | "refresh";

/** State and commands returned by {@link useObjectList}. */
export type UseObjectListReturn<TItem> = {
  items: readonly TItem[];
  /** Child folders from the latest first page. */
  folders: readonly ObjectListFolder[];
  /** Path from the root, root excluded. */
  trail: readonly ObjectListFolder[];
  parent: string | null;
  nextCursor: string | null;
  error: APIError | null;
  /** True while the first page for this folder is in flight. */
  isLoading: boolean;
  /** True while a later page is in flight. */
  isLoadingMore: boolean;
  /** True while the current folder is reloading and previous rows stay visible. */
  isRefreshing: boolean;
  /**
   * Totals from the latest page that sent them. `null` when the source
   * did not.
   */
  usage: ObjectListUsage | null;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  /** Open a child folder and load its first page. */
  openFolder: (folder: ObjectListFolder) => void;
  /** Replace the path. Pass `[]` for the root. */
  navigate: (trail: readonly ObjectListFolder[]) => void;
};

function serializeQueryKey(key: readonly unknown[] | undefined): string {
  return JSON.stringify(key ?? []);
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

function syncTrail(
  trail: readonly ObjectListFolder[],
  parent: string | null,
): readonly ObjectListFolder[] {
  if (parent == null) return [];
  const index = trail.findIndex((folder) => folder.id === parent);
  if (index >= 0) return trail.slice(0, index + 1);
  return [{ id: parent, name: parent }];
}

/**
 * Page through a folder catalog without knowing the backend.
 *
 * Pass `query`. It receives the current folder id, a cursor, and an abort
 * signal. `dbObjectQuery` from `@dimah-s3/db/client` is one adapter; a
 * route handler or in-memory list is another. The hook never calls S3.
 *
 * ```ts
 * const list = useObjectList({
 *   query: ({ parent, cursor, signal }) =>
 *     fetchFiles({ folderId: parent, cursor, signal }),
 *   queryKey: [route],
 * });
 * ```
 */
export function useObjectList<TItem>(
  options: UseObjectListOptions<TItem>,
): UseObjectListReturn<TItem> {
  const optionsRef = useLiveRef(options);
  const controlled = options.parent !== undefined;
  const enabled = options.enabled !== false;
  const queryKey = serializeQueryKey(options.queryKey);

  const [parentState, setParentState] = useState<string | null>(() => {
    if (options.defaultParent !== undefined) return options.defaultParent;
    return options.defaultTrail?.at(-1)?.id ?? null;
  });
  const parent = controlled ? (options.parent ?? null) : parentState;

  const [trailState, setTrailState] = useState<readonly ObjectListFolder[]>(
    () => {
      const initial = options.defaultTrail ?? [];
      if (options.parent !== undefined)
        return syncTrail(initial, options.parent);
      if (options.defaultParent !== undefined) {
        return syncTrail(initial, options.defaultParent);
      }
      return initial;
    },
  );
  const trail = useMemo(
    () => (controlled ? syncTrail(trailState, parent) : trailState),
    [controlled, trailState, parent],
  );
  const [items, setItems] = useState<readonly TItem[]>([]);
  const [folders, setFolders] = useState<readonly ObjectListFolder[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [usage, setUsage] = useState<ObjectListUsage | null>(null);
  const [error, setError] = useState<APIError | null>(null);
  const [status, setStatus] = useState<Status>(enabled ? "loading" : "ready");

  const parentRef = useLiveRef(parent);
  const trailRef = useLiveRef(trail);
  const cursorRef = useLiveRef(nextCursor);
  const statusRef = useLiveRef(status);
  const itemsRef = useLiveRef(items);
  const foldersRef = useLiveRef(folders);
  const abortRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);

  const applyPage = useCallback(
    (page: ObjectListPage<TItem>, mode: FetchMode) => {
      if (mode === "append") {
        setItems((current) => [...current, ...page.items]);
        if (page.usage) setUsage(page.usage);
      } else {
        setItems(page.items);
        setFolders(page.folders ?? []);
        setUsage(page.usage ?? null);
      }
      const cursor = page.nextCursor ? page.nextCursor : null;
      cursorRef.current = cursor;
      statusRef.current = "ready";
      setNextCursor(cursor);
      setError(null);
      setStatus("ready");
    },
    [cursorRef, statusRef],
  );

  const run = useCallback(
    async (mode: FetchMode) => {
      if (optionsRef.current.enabled === false) return;

      const cursor = mode === "append" ? cursorRef.current : null;
      if (mode === "append") {
        if (!cursor) return;
        const current = statusRef.current;
        if (
          current === "loading" ||
          current === "loading-more" ||
          current === "refreshing"
        ) {
          return;
        }
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const generation = ++generationRef.current;
      const requestParent = parentRef.current;
      const hasRows =
        itemsRef.current.length > 0 || foldersRef.current.length > 0;

      if (mode === "replace") {
        setItems([]);
        setFolders([]);
        setNextCursor(null);
        setError(null);
        statusRef.current = "loading";
        setStatus("loading");
      } else if (mode === "refresh") {
        setError(null);
        const nextStatus = hasRows ? "refreshing" : "loading";
        statusRef.current = nextStatus;
        setStatus(nextStatus);
      } else {
        statusRef.current = "loading-more";
        setStatus("loading-more");
      }

      try {
        const page = await optionsRef.current.query({
          parent: requestParent,
          cursor,
          signal: controller.signal,
        });
        if (generation !== generationRef.current || controller.signal.aborted) {
          return;
        }
        applyPage(page, mode);
      } catch (err) {
        if (
          generation !== generationRef.current ||
          controller.signal.aborted ||
          isAbortError(err)
        ) {
          return;
        }
        setError(toHookError(err, "Could not load files"));
        statusRef.current = "error";
        setStatus("error");
      }
    },
    [
      abortRef,
      applyPage,
      cursorRef,
      foldersRef,
      generationRef,
      itemsRef,
      optionsRef,
      parentRef,
      statusRef,
    ],
  );

  useEffect(() => {
    if (!enabled) {
      abortRef.current?.abort();
      return;
    }

    let active = true;
    void (async () => {
      await Promise.resolve();
      if (!active) return;
      await run("replace");
    })();
    return () => {
      active = false;
      abortRef.current?.abort();
    };
  }, [abortRef, enabled, parent, queryKey, run]);

  const navigate = useCallback(
    (nextTrail: readonly ObjectListFolder[]) => {
      const nextParent = nextTrail.at(-1)?.id ?? null;
      if (
        nextParent === parentRef.current &&
        trailsEqual(nextTrail, trailRef.current)
      ) {
        return;
      }
      const previousParent = parentRef.current;
      trailRef.current = nextTrail;
      setTrailState(nextTrail);
      if (optionsRef.current.parent === undefined) {
        parentRef.current = nextParent;
        setParentState(nextParent);
      }
      if (nextParent !== previousParent) {
        cursorRef.current = null;
        setItems([]);
        setFolders([]);
        setNextCursor(null);
        setError(null);
        statusRef.current = "loading";
        setStatus("loading");
      }
      optionsRef.current.onParentChange?.(nextParent);
    },
    [cursorRef, optionsRef, parentRef, statusRef, trailRef],
  );

  const openFolder = useCallback(
    (folder: ObjectListFolder) => {
      const current = trailRef.current;
      const index = current.findIndex((entry) => entry.id === folder.id);
      const next =
        index >= 0 ? current.slice(0, index + 1) : [...current, folder];
      navigate(next);
    },
    [navigate, trailRef],
  );

  const loadMore = useCallback(() => run("append"), [run]);
  const refresh = useCallback(() => run("refresh"), [run]);

  return {
    items,
    folders,
    trail,
    parent,
    nextCursor,
    error,
    isLoading: enabled && status === "loading",
    isLoadingMore: enabled && status === "loading-more",
    isRefreshing: enabled && status === "refreshing",
    usage,
    hasMore: nextCursor != null,
    loadMore,
    refresh,
    openFolder,
    navigate,
  };
}
