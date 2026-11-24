/*
 * Values the server plugin and the browser client share. This module imports
 * nothing, so `@dimah-s3/share/client` stays free of Zod and FumaDB.
 */

/** Most rows one page of `GET /share/links` or `GET /share/items` returns. */
export const SHARE_LIST_MAX_LIMIT = 100;

/** Rows a page returns when the call sets no `limit`. */
export const SHARE_LIST_DEFAULT_LIMIT = 50;

/** Highest `maxDownloads` a link can set. */
export const SHARE_MAX_DOWNLOADS_LIMIT = 1_000_000;

/** Longest password, in characters. */
export const SHARE_PASSWORD_MAX_LENGTH = 256;

/**
 * Actions anyone holding a link may call, without a session: they read the
 * link, unlock it, list a shared folder, and download from it. Let them
 * through an instance guard that requires a session with
 * {@link isSharePublicAction}.
 */
export const SHARE_PUBLIC_ACTIONS = [
  "openLink",
  "unlockLink",
  "listShared",
  "downloadShared",
  "sharedFile",
] as const;

/** An action of {@link SHARE_PUBLIC_ACTIONS}. */
export type SharePublicAction = (typeof SHARE_PUBLIC_ACTIONS)[number];

/** Actions only the link owner calls. Each one resolves the caller's db scope. */
export const SHARE_OWNER_ACTIONS = [
  "createLink",
  "listLinks",
  "getLink",
  "updateLink",
  "revokeLink",
] as const;

/** An action of {@link SHARE_OWNER_ACTIONS}. */
export type ShareOwnerAction = (typeof SHARE_OWNER_ACTIONS)[number];

const PUBLIC: ReadonlySet<string> = new Set(SHARE_PUBLIC_ACTIONS);

/**
 * True for a guard context of a public share action: a visitor holding a
 * link, who has no session. Use it in an instance guard that requires one.
 *
 * ```ts
 * guard: async (context) => {
 *   if (isSharePublicAction(context)) return;
 *   await requireSession(context.request);
 * },
 * ```
 */
export function isSharePublicAction(context: {
  operation: string;
  plugin?: { id: string; action: string };
}): boolean {
  return (
    context.operation === "plugin" &&
    context.plugin?.id === "share" &&
    PUBLIC.has(context.plugin.action)
  );
}
