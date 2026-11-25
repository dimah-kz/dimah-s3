import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { APIError } from "@dimah-s3/core";
import { SHARE_LIST_MAX_LIMIT } from "@/constants";
import type {
  ShareClientActions,
  ShareClientLink,
  ShareLinkSettingsInput,
  ShareTargetInput,
} from "@/types/client";
import type { ShareLinkStatus } from "@/types/link";
import { toShareError } from "./to-share-error";

/** The owner actions {@link useShareLinks} calls: `api.share` from `shareClient()`. */
export type ShareLinksActions = Pick<
  ShareClientActions,
  "listLinks" | "createLink" | "updateLink" | "revokeLink"
>;

/** Options of {@link useShareLinks}. */
export type UseShareLinksOptions = {
  /**
   * Also list revoked links, and keep a link in `links` once revoked.
   * Ignored with `status`. @default false
   */
  includeRevoked?: boolean;
  /**
   * Only links in this status or these statuses, such as `"active"` for
   * the links that still open. A link that a create, change, or revoke
   * moves out of them leaves `links`. Takes precedence over
   * `includeRevoked`.
   */
  status?: ShareLinkStatus | readonly ShareLinkStatus[];
  /** Links per page, 1 to 100. @default 100 */
  limit?: number;
};

/**
 * Where the list stands, as in `useObjectList`.
 * - `idle`: no target
 * - `loading`: the first page is on its way, and there is nothing to show
 * - `refreshing`: the first page is on its way again; `links` stay
 * - `loading-more`: the next page is on its way
 * - `ready`: `links` holds the target's links
 * - `error`: the last load failed; `error` says why
 */
export type ShareLinksStatus =
  "idle" | "loading" | "refreshing" | "loading-more" | "ready" | "error";

/** What {@link useShareLinks} returns. */
export type UseShareLinksReturn = {
  /** The object or folder the links belong to. `null` while there is none. */
  target: ShareTargetInput | null;
  /** The target's links, newest first. */
  links: readonly ShareClientLink[];
  status: ShareLinksStatus;
  /** Why the last load failed, while `status` is `error`. */
  error: APIError | null;
  /** True while the first page is on its way and there is nothing to show. */
  isLoading: boolean;
  /** True while the first page loads again; `links` stay. */
  isRefreshing: boolean;
  /** True while the next page is on its way. */
  isLoadingMore: boolean;
  /** True when another page follows. */
  hasMore: boolean;
  /**
   * Loads the next page and appends it. Ignored while another load is on
   * its way. Never rejects: a failure sets `error`, and the loaded links stay.
   */
  loadMore: () => Promise<void>;
  /**
   * Loads the first page again, keeping `links` until it arrives. Never
   * rejects: a failure sets `error`.
   */
  refresh: () => Promise<void>;
  /** Repeats the load that failed: the next page, or the first. */
  retry: () => Promise<void>;
  /**
   * Creates a link to the target with `settings`, and puts it first.
   * Rejects with an `APIError`, such as `VALIDATION_ERROR`.
   */
  create: (settings?: ShareLinkSettingsInput) => Promise<ShareClientLink>;
  /**
   * Changes a link's settings and replaces its row. Omitted fields stay;
   * `null` clears one. Rejects with an `APIError`.
   */
  update: (
    id: string,
    settings: ShareLinkSettingsInput,
  ) => Promise<ShareClientLink>;
  /**
   * Turns a link off. It leaves `links` unless `includeRevoked` is set or
   * `status` has `revoked`. Rejects with an `APIError`.
   */
  revoke: (id: string) => Promise<ShareClientLink>;
};

type FetchMode = "replace" | "refresh" | "append";

type ListState = {
  /** The target and options this state is for. */
  key: string | null;
  links: readonly ShareClientLink[];
  cursor: string | null;
  /** The load on its way. */
  pending: FetchMode | null;
  /** The load that failed last, until another one starts. */
  failure: { mode: FetchMode; error: APIError } | null;
};

const NO_LINKS: readonly ShareClientLink[] = [];

const EMPTY: ListState = {
  key: null,
  links: NO_LINKS,
  cursor: null,
  pending: null,
  failure: null,
};

/** One string per target and options, so a new object for the same target does not reload. */
function listKey(
  target: ShareTargetInput | null,
  includeRevoked: boolean,
  statuses: readonly ShareLinkStatus[] | undefined,
  limit: number,
): string | null {
  if (target === null) return null;
  const id =
    target.type === "object"
      ? ["object", target.bucket ?? "", target.key]
      : ["folder", target.folderId];
  return JSON.stringify([...id, includeRevoked, statuses ?? null, limit]);
}

/** `status` as a sorted list without repeats, so its order does not reload. */
function statusList(
  status: UseShareLinksOptions["status"],
): readonly ShareLinkStatus[] | undefined {
  if (status === undefined) return undefined;
  return [...new Set(typeof status === "string" ? [status] : status)].sort();
}

/** Whether `link` belongs in a list with these options. */
function listed(
  link: ShareClientLink,
  includeRevoked: boolean,
  statuses: readonly ShareLinkStatus[] | undefined,
): boolean {
  if (statuses !== undefined) return statuses.includes(link.status);
  return includeRevoked || link.status !== "revoked";
}

/** `limit` as a whole number from 1 to {@link SHARE_LIST_MAX_LIMIT}. */
function pageLimit(limit: number | undefined): number {
  if (limit === undefined || Number.isNaN(limit)) return SHARE_LIST_MAX_LIMIT;
  return Math.min(Math.max(Math.floor(limit), 1), SHARE_LIST_MAX_LIMIT);
}

/** `links` with `link` in place of the row of the same id. */
function replaceLink(
  links: readonly ShareClientLink[],
  link: ShareClientLink,
): readonly ShareClientLink[] {
  return links.map((current) => (current.id === link.id ? link : current));
}

function readStatus(key: string | null, state: ListState): ShareLinksStatus {
  if (key === null) return "idle";
  if (state.key !== key) return "loading";
  switch (state.pending) {
    case "append":
      return "loading-more";
    case "replace":
      return "loading";
    case "refresh":
      return state.links.length > 0 ? "refreshing" : "loading";
    case null:
      return state.failure ? "error" : "ready";
  }
}

/**
 * The share links of one object or folder, for an owner screen: loads
 * them, and creates, changes, and revokes them. Pass `api.share` from a
 * client with `shareClient()`. A `null` target waits, so a dialog can pass
 * its target only while it is open.
 *
 * ```tsx
 * const api = s3Client.useApi();
 * const links = useShareLinks(api.share, { type: "object", key });
 *
 * <ShareLinkDialog links={links} open onOpenChange={setOpen} />
 * ```
 *
 * Calls run as the signed-in caller, so the server's `authorize` sees them
 * as the owner actions they are.
 */
export function useShareLinks(
  share: ShareLinksActions,
  target: ShareTargetInput | null,
  options: UseShareLinksOptions = {},
): UseShareLinksReturn {
  const includeRevoked = options.includeRevoked === true;
  const statuses = statusList(options.status);
  const limit = pageLimit(options.limit);
  const key = listKey(target, includeRevoked, statuses, limit);

  const stateRef = useRef<ListState>(EMPTY);
  const [state, setState] = useState<ListState>(EMPTY);
  /** Changes the state now, so a call in the same tick reads it. */
  const update = useCallback((change: (state: ListState) => ListState) => {
    const next = change(stateRef.current);
    if (next === stateRef.current) return;
    stateRef.current = next;
    setState(next);
  }, []);

  // The newest render's values, for callbacks that outlive it.
  const latest = useRef({
    share,
    target,
    includeRevoked,
    statuses,
    limit,
    key,
  });
  useEffect(() => {
    latest.current = { share, target, includeRevoked, statuses, limit, key };
  });
  const abortRef = useRef<AbortController | null>(null);
  /** Bumped by every load, so an older answer is dropped. */
  const generationRef = useRef(0);

  const run = useCallback(
    async (requested: FetchMode) => {
      const current = latest.current;
      if (current.target === null || current.key === null) return;
      const listed = current.key;
      const before = stateRef.current;
      const sameKey = before.key === listed;
      const mode: FetchMode = sameKey ? requested : "replace";
      if (mode === "append" && (before.cursor === null || before.pending)) {
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const generation = ++generationRef.current;
      const isCurrent = () =>
        generation === generationRef.current && !controller.signal.aborted;

      update((draft) => ({
        ...(mode === "replace" ? { ...EMPTY, key: listed } : draft),
        pending: mode,
        failure: null,
      }));
      try {
        const page = await current.share.listLinks(
          {
            target: current.target,
            includeRevoked: current.includeRevoked,
            ...(current.statuses !== undefined && {
              status: current.statuses,
            }),
            limit: current.limit,
            ...(mode === "append" && before.cursor !== null
              ? { cursor: before.cursor }
              : {}),
          },
          { signal: controller.signal },
        );
        if (!isCurrent()) return;
        update((draft) => {
          if (mode !== "append") {
            return {
              key: listed,
              links: page.links,
              cursor: page.nextCursor,
              pending: null,
              failure: null,
            };
          }
          const seen = new Set(draft.links.map((link) => link.id));
          return {
            ...draft,
            links: [
              ...draft.links,
              ...page.links.filter((link) => !seen.has(link.id)),
            ],
            cursor: page.nextCursor,
            pending: null,
            failure: null,
          };
        });
      } catch (caught) {
        if (!isCurrent()) return;
        const error = toShareError(caught);
        update((draft) => ({
          ...draft,
          pending: null,
          failure: { mode, error },
        }));
      }
    },
    [update],
  );

  useEffect(() => {
    if (key === null) return;
    let active = true;
    // One microtask: a Strict Mode remount cancels before the request starts.
    void Promise.resolve().then(() => {
      if (active) void run("replace");
    });
    return () => {
      active = false;
      abortRef.current?.abort();
      generationRef.current += 1;
      update((draft) => (draft.pending ? { ...draft, pending: null } : draft));
    };
  }, [key, run, update]);

  const loadMore = useCallback(() => run("append"), [run]);
  const refresh = useCallback(() => run("refresh"), [run]);
  const retry = useCallback(
    () =>
      run(stateRef.current.failure?.mode === "append" ? "append" : "refresh"),
    [run],
  );

  /** Applies `change` to the links while the state is still for `forKey`. */
  const editLinks = useCallback(
    (
      forKey: string | null,
      change: (links: readonly ShareClientLink[]) => readonly ShareClientLink[],
    ) => {
      update((draft) =>
        draft.key === forKey && forKey !== null
          ? { ...draft, links: change(draft.links) }
          : draft,
      );
    },
    [update],
  );

  /**
   * Puts `link` in place of its row, first when it is new, or takes it out
   * when the list's options no longer cover it.
   */
  const placeLink = useCallback(
    (link: ShareClientLink, position: "first" | "in place") => {
      const {
        key: forKey,
        includeRevoked: keep,
        statuses: only,
      } = latest.current;
      editLinks(forKey, (links) => {
        if (!listed(link, keep, only)) {
          return links.filter((row) => row.id !== link.id);
        }
        return position === "first"
          ? [link, ...links.filter((row) => row.id !== link.id)]
          : replaceLink(links, link);
      });
    },
    [editLinks],
  );

  const create = useCallback(
    async (settings: ShareLinkSettingsInput = {}) => {
      const { share: actions, target: shared } = latest.current;
      if (shared === null) {
        throw new TypeError("useShareLinks: create needs a target.");
      }
      try {
        const { link } = await actions.createLink({
          ...settings,
          target: shared,
        });
        placeLink(link, "first");
        return link;
      } catch (caught) {
        throw toShareError(caught);
      }
    },
    [placeLink],
  );

  const updateLink = useCallback(
    async (id: string, settings: ShareLinkSettingsInput) => {
      const { share: actions } = latest.current;
      try {
        const { link } = await actions.updateLink({ ...settings, id });
        placeLink(link, "in place");
        return link;
      } catch (caught) {
        throw toShareError(caught);
      }
    },
    [placeLink],
  );

  const revoke = useCallback(
    async (id: string) => {
      const { share: actions } = latest.current;
      try {
        const { link } = await actions.revokeLink({ id });
        placeLink(link, "in place");
        return link;
      } catch (caught) {
        throw toShareError(caught);
      }
    },
    [placeLink],
  );

  const fresh = key !== null && state.key === key;
  const links = fresh ? state.links : NO_LINKS;
  const status = readStatus(key, state);
  const error =
    fresh && status === "error" ? (state.failure?.error ?? null) : null;
  const hasMore = fresh && state.cursor !== null;

  return useMemo(
    () => ({
      target,
      links,
      status,
      error,
      isLoading: status === "loading",
      isRefreshing: status === "refreshing",
      isLoadingMore: status === "loading-more",
      hasMore,
      loadMore,
      refresh,
      retry,
      create,
      update: updateLink,
      revoke,
    }),
    [
      target,
      links,
      status,
      error,
      hasMore,
      loadMore,
      refresh,
      retry,
      create,
      updateLink,
      revoke,
    ],
  );
}
