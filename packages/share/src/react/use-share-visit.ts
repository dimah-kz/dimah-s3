import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { APIError } from "@dimah-s3/core";
import {
  downloadSharedFile,
  shareObjectSource,
  type ShareObjectSource,
} from "@/client/share-object-source";
import type {
  ShareAccess,
  ShareClientActions,
  ShareDownloadResponse,
  ShareVisitorLink,
  ShareVisitorLockedLink,
  ShareVisitorOpenLink,
} from "@/types/client";
import { isAbort, toShareError } from "./to-share-error";

/** The visitor actions {@link useShareVisit} calls: `api.share` from `shareClient()`. */
export type ShareVisitorActions = Pick<
  ShareClientActions,
  "openLink" | "unlockLink" | "listShared" | "downloadShared"
>;

/** Options of {@link useShareVisit}. */
export type UseShareVisitOptions = {
  /**
   * The link as `openLink` returned it on the server for this token, so
   * the page renders at once. Without it, the hook opens the link itself.
   */
  link?: ShareVisitorLink;
};

/**
 * Where the visit stands.
 * - `loading`: the link is opening
 * - `locked`: the link waits for its password; call `unlock`
 * - `ready`: the link opened; `link` holds its file or folder
 * - `error`: the link does not open; `error` says why
 */
export type ShareVisitStatus = "loading" | "locked" | "ready" | "error";

/** The part of {@link UseShareVisitReturn} that `status` tells apart. */
export type ShareVisitState =
  | { status: "loading"; link: null; error: null }
  | { status: "locked"; link: ShareVisitorLockedLink; error: null }
  | { status: "ready"; link: ShareVisitorOpenLink; error: null }
  | { status: "error"; link: null; error: APIError };

/** Options of `download` on {@link UseShareVisitReturn}. */
export type ShareVisitDownloadOptions = {
  /** `inline` opens the file in the tab, for a type the route allows inline. */
  disposition?: "inline" | "attachment";
};

/** What {@link useShareVisit} returns. */
export type UseShareVisitReturn = ShareVisitState & {
  /** The link token the visit is for. */
  token: string;
  /** The proof of the password, from `unlock`. Every later call sends it. */
  access: ShareAccess | undefined;
  /**
   * Trades the password for `access`, then opens the link again. Rejects
   * with an `APIError`, such as `SHARE_PASSWORD_INVALID` or
   * `TOO_MANY_REQUESTS`.
   */
  unlock: (password: string) => Promise<void>;
  /**
   * Gets a download URL for a file of the link and sends the browser to
   * it, then updates `link.downloadsLeft`. Each call counts one download.
   * `id` is the file's id from the folder listing; an object link needs
   * none. Rejects with an `APIError`.
   */
  download: (
    id?: string,
    options?: ShareVisitDownloadOptions,
  ) => Promise<ShareDownloadResponse>;
  /** Opens the link again, such as after a network error. */
  refresh: () => void;
  /**
   * A read-only `useObjectList` source over the link, with `access`. A new
   * one comes with each `access`, so key the list by `token` and `access`.
   */
  source: ShareObjectSource;
};

/**
 * Codes that end the visit: the link stopped opening while the page was
 * open, so the page says why instead of the file or folder.
 */
const LINK_REFUSALS: ReadonlySet<string> = new Set([
  "SHARE_LINK_NOT_FOUND",
  "SHARE_LINK_EXPIRED",
  "SHARE_LINK_REVOKED",
  "SHARE_LINK_EXHAUSTED",
]);

type VisitState = ShareVisitState & {
  token: string;
  access: ShareAccess | undefined;
};

function fromLink(
  token: string,
  access: ShareAccess | undefined,
  link: ShareVisitorLink,
): VisitState {
  return link.locked
    ? { token, access, status: "locked", link, error: null }
    : { token, access, status: "ready", link, error: null };
}

function initialState(
  token: string,
  link: ShareVisitorLink | undefined,
): VisitState {
  return link
    ? fromLink(token, undefined, link)
    : { token, access: undefined, status: "loading", link: null, error: null };
}

/** The locked form of an open link, for a password that stopped working. */
function relocked(link: ShareVisitorOpenLink): ShareVisitorLockedLink {
  return {
    type: link.type,
    locked: true,
    passwordProtected: true,
    expiresAt: link.expiresAt,
    downloadsLeft: link.downloadsLeft,
  };
}

/**
 * The state of the page a share link opens, for a visitor without a
 * session: opens the link, unlocks it with its password, and downloads its
 * files. Pass `api.share` from a client with `shareClient()`, and the token
 * from the page URL.
 *
 * ```tsx
 * const visit = useShareVisit(s3Client.share, token);
 *
 * <SharedView visit={visit} />
 * ```
 *
 * A call that finds the link gone (`SHARE_LINK_EXPIRED`, revoked, out of
 * downloads, or deleted) moves the visit to `error`. One whose password
 * proof expired, or whose password the owner changed, moves it back to
 * `locked`.
 */
export function useShareVisit(
  share: ShareVisitorActions,
  token: string,
  options: UseShareVisitOptions = {},
): UseShareVisitReturn {
  const [stored, setStored] = useState<VisitState>(() =>
    initialState(token, options.link),
  );
  // A new token starts over, from its server link when one came with it.
  let state = stored;
  if (stored.token !== token) {
    state = initialState(token, options.link);
    setStored(state);
  }

  const latest = useRef({ share, state });
  useEffect(() => {
    latest.current = { share, state };
  });

  /** Changes the state while it is still for `token` and `access`. */
  const settle = useCallback(
    (
      forToken: string,
      forAccess: ShareAccess | undefined,
      change: (state: VisitState) => VisitState,
    ) => {
      setStored((current) =>
        current.token === forToken && current.access === forAccess
          ? change(current)
          : current,
      );
    },
    [],
  );

  /** Ends the visit or locks it again for a code that says so. */
  const endOrLock = useCallback(
    (forToken: string, forAccess: ShareAccess | undefined, error: APIError) => {
      if (LINK_REFUSALS.has(error.code)) {
        settle(forToken, forAccess, (current) => ({
          token: current.token,
          access: current.access,
          status: "error",
          link: null,
          error,
        }));
      } else if (error.code === "SHARE_PASSWORD_REQUIRED") {
        settle(forToken, forAccess, (current) =>
          current.status === "ready"
            ? {
                token: current.token,
                access: undefined,
                status: "locked",
                link: relocked(current.link),
                error: null,
              }
            : current,
        );
      }
    },
    [settle],
  );

  const { status, access } = state;
  useEffect(() => {
    if (status !== "loading") return;
    const controller = new AbortController();
    let active = true;
    // One microtask: a Strict Mode remount cancels before the request
    // starts, so an unlocked link counts one view.
    void Promise.resolve().then(async () => {
      if (!active) return;
      try {
        const { link } = await share.openLink(
          { token, ...(access !== undefined && { access }) },
          { signal: controller.signal },
        );
        if (!active) return;
        settle(token, access, () => fromLink(token, access, link));
      } catch (caught) {
        if (!active || isAbort(caught)) return;
        const error = toShareError(caught);
        settle(token, access, () => ({
          token,
          access,
          status: "error",
          link: null,
          error,
        }));
      }
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [status, access, token, share, settle]);

  const unlock = useCallback(
    async (password: string) => {
      const { share: actions, state: current } = latest.current;
      let granted: ShareAccess;
      try {
        ({ access: granted } = await actions.unlockLink({
          token: current.token,
          password,
        }));
      } catch (caught) {
        const error = toShareError(caught);
        endOrLock(current.token, current.access, error);
        throw error;
      }
      settle(current.token, current.access, (now) => ({
        token: now.token,
        access: granted,
        status: "loading",
        link: null,
        error: null,
      }));
    },
    [endOrLock, settle],
  );

  const download = useCallback(
    async (id?: string, downloadOptions: ShareVisitDownloadOptions = {}) => {
      const { share: actions, state: current } = latest.current;
      try {
        const response = await downloadSharedFile(actions, id, {
          token: current.token,
          ...(current.access !== undefined && { access: current.access }),
          ...(downloadOptions.disposition !== undefined && {
            disposition: downloadOptions.disposition,
          }),
        });
        settle(current.token, current.access, (now) =>
          now.status === "ready"
            ? {
                ...now,
                link: { ...now.link, downloadsLeft: response.downloadsLeft },
              }
            : now,
        );
        return response;
      } catch (caught) {
        const error = toShareError(caught);
        endOrLock(current.token, current.access, error);
        throw error;
      }
    },
    [endOrLock, settle],
  );

  const refresh = useCallback(() => {
    setStored((current) => ({
      token: current.token,
      access: current.access,
      status: "loading",
      link: null,
      error: null,
    }));
  }, []);

  // The folder listing ends or locks the visit too, like any other call.
  const source = useMemo(
    () =>
      shareObjectSource(
        {
          listShared: async (input, requestOptions) => {
            try {
              return await share.listShared(input, requestOptions);
            } catch (caught) {
              if (!isAbort(caught))
                endOrLock(token, access, toShareError(caught));
              throw caught;
            }
          },
        },
        { token, ...(access !== undefined && { access }) },
      ),
    [share, token, access, endOrLock],
  );

  return useMemo(
    () =>
      ({
        ...(state.status === "ready"
          ? { status: "ready", link: state.link, error: null }
          : state.status === "locked"
            ? { status: "locked", link: state.link, error: null }
            : state.status === "error"
              ? { status: "error", link: null, error: state.error }
              : { status: "loading", link: null, error: null }),
        token: state.token,
        access: state.access,
        unlock,
        download,
        refresh,
        source,
      }) satisfies UseShareVisitReturn,
    [state, unlock, download, refresh, source],
  );
}
