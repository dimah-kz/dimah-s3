import { useCallback, useEffect, useRef, useState } from "react";
import { SHARE_LIST_MAX_LIMIT } from "@/constants";
import type {
  ShareClientActions,
  ShareClientLink,
  ShareLinkSettingsInput,
  ShareTargetInput,
} from "@/types/client";

/** The owner actions {@link useShareLinks} calls: `api.share` from `shareClient()`. */
export type ShareLinksActions = Pick<
  ShareClientActions,
  "listLinks" | "createLink" | "updateLink" | "revokeLink"
>;

/** Options of {@link useShareLinks}. */
export type UseShareLinksOptions = {
  /** Also list revoked links, and keep a link in `links` once revoked. @default false */
  includeRevoked?: boolean;
  /** Links per page. @default 100, the most a page holds */
  limit?: number;
};

/**
 * Where the list stands.
 * - `idle`: no target
 * - `loading`: the first page is on its way
 * - `success`: `links` holds the target's links
 * - `error`: the first page failed; `error` says why
 */
export type ShareLinksStatus = "idle" | "loading" | "success" | "error";

/** What {@link useShareLinks} returns. */
export type UseShareLinksReturn = {
  /** The target's links, newest first. */
  links: ShareClientLink[];
  status: ShareLinksStatus;
  /** What the last load threw, while `status` is `error`. */
  error: unknown;
  /** True when another page follows. */
  hasMore: boolean;
  /** Loads the next page and appends it. */
  loadMore: () => Promise<void>;
  /** Loads the first page again. */
  refresh: () => Promise<void>;
  /**
   * Creates a link to the target with `settings`, and puts it first.
   * Rejects with the API error, such as `VALIDATION_ERROR`.
   */
  create: (settings?: ShareLinkSettingsInput) => Promise<ShareClientLink>;
  /** Changes a link's settings. Omitted fields stay; `null` clears one. */
  update: (
    id: string,
    settings: ShareLinkSettingsInput,
  ) => Promise<ShareClientLink>;
  /** Turns a link off. Without `includeRevoked`, it leaves `links`. */
  revoke: (id: string) => Promise<ShareClientLink>;
};

type ListState = {
  /** The target and options this state is for. */
  key: string | null;
  links: ShareClientLink[];
  status: ShareLinksStatus;
  error: unknown;
  cursor: string | null;
};

/** One string per target and options, so a new object for the same target does not reload. */
function listKey(
  target: ShareTargetInput | null,
  includeRevoked: boolean,
  limit: number,
): string | null {
  if (target === null) return null;
  const id =
    target.type === "object"
      ? ["object", target.bucket ?? "", target.key]
      : ["folder", target.folderId];
  return JSON.stringify([...id, includeRevoked, limit]);
}

/** `links` with `link` in place of the row of the same id. */
function replaceLink(
  links: readonly ShareClientLink[],
  link: ShareClientLink,
): ShareClientLink[] {
  return links.map((current) => (current.id === link.id ? link : current));
}

/**
 * The share links of one object or folder, for an owner screen: loads
 * them, and creates, changes, and revokes them. Pass `api.share` from a
 * client with `shareClient()`. A `null` target waits.
 *
 * ```tsx
 * const api = s3Client.useApi();
 * const { links, status, create, revoke } = useShareLinks(api.share, {
 *   type: "object",
 *   key,
 * });
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
  const limit = options.limit ?? SHARE_LIST_MAX_LIMIT;
  const key = listKey(target, includeRevoked, limit);
  const [state, setState] = useState<ListState>({
    key: null,
    links: [],
    status: "idle",
    error: undefined,
    cursor: null,
  });

  // The newest render's values, for callbacks that outlive it.
  const latest = useRef({ share, target, includeRevoked, limit, key });
  useEffect(() => {
    latest.current = { share, target, includeRevoked, limit, key };
  });
  /** Bumped by every first-page load, so an older answer is dropped. */
  const generation = useRef(0);

  const loadFirst = useCallback(async (signal?: AbortSignal) => {
    const current = latest.current;
    const run = ++generation.current;
    if (current.target === null) return;
    const loadedKey = current.key;
    try {
      const page = await current.share.listLinks(
        {
          target: current.target,
          includeRevoked: current.includeRevoked,
          limit: current.limit,
        },
        { signal },
      );
      if (run !== generation.current) return;
      setState({
        key: loadedKey,
        links: page.links,
        status: "success",
        error: undefined,
        cursor: page.nextCursor,
      });
    } catch (error) {
      if (run !== generation.current || signal?.aborted) return;
      setState({
        key: loadedKey,
        links: [],
        status: "error",
        error,
        cursor: null,
      });
    }
  }, []);

  useEffect(() => {
    if (key === null) return;
    const controller = new AbortController();
    void loadFirst(controller.signal);
    return () => controller.abort();
  }, [key, loadFirst]);

  const current = state.key === key && key !== null;
  const links = current ? state.links : [];
  const status: ShareLinksStatus =
    key === null ? "idle" : current ? state.status : "loading";

  /** Applies `change` while the state is still for `forKey`. */
  const patchState = useCallback(
    (forKey: string | null, change: (state: ListState) => ListState) => {
      setState((previous) =>
        previous.key === forKey ? change(previous) : previous,
      );
    },
    [],
  );

  const loadMore = useCallback(async () => {
    const { share: actions, target: listed, key: forKey } = latest.current;
    const cursor = state.key === forKey ? state.cursor : null;
    if (listed === null || cursor === null) return;
    const page = await actions.listLinks({
      target: listed,
      includeRevoked: latest.current.includeRevoked,
      limit: latest.current.limit,
      cursor,
    });
    patchState(forKey, (previous) => {
      const seen = new Set(previous.links.map((link) => link.id));
      return {
        ...previous,
        links: [
          ...previous.links,
          ...page.links.filter((link) => !seen.has(link.id)),
        ],
        cursor: page.nextCursor,
      };
    });
  }, [patchState, state.cursor, state.key]);

  const refresh = useCallback(() => loadFirst(), [loadFirst]);

  const create = useCallback(
    async (settings: ShareLinkSettingsInput = {}) => {
      const { share: actions, target: shared, key: forKey } = latest.current;
      if (shared === null) {
        throw new TypeError("useShareLinks: create needs a target.");
      }
      const { link } = await actions.createLink({
        ...settings,
        target: shared,
      });
      patchState(forKey, (previous) => ({
        ...previous,
        links: [link, ...previous.links.filter((row) => row.id !== link.id)],
      }));
      return link;
    },
    [patchState],
  );

  const updateLink = useCallback(
    async (id: string, settings: ShareLinkSettingsInput) => {
      const { share: actions, key: forKey } = latest.current;
      const { link } = await actions.updateLink({ ...settings, id });
      patchState(forKey, (previous) => ({
        ...previous,
        links: replaceLink(previous.links, link),
      }));
      return link;
    },
    [patchState],
  );

  const revoke = useCallback(
    async (id: string) => {
      const {
        share: actions,
        key: forKey,
        includeRevoked: keep,
      } = latest.current;
      const { link } = await actions.revokeLink({ id });
      patchState(forKey, (previous) => ({
        ...previous,
        links: keep
          ? replaceLink(previous.links, link)
          : previous.links.filter((row) => row.id !== link.id),
      }));
      return link;
    },
    [patchState],
  );

  return {
    links,
    status,
    error: current && state.status === "error" ? state.error : undefined,
    hasMore: current && state.cursor !== null,
    loadMore,
    refresh,
    create,
    update: updateLink,
    revoke,
  };
}
