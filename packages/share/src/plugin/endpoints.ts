import { pluginPath } from "@dimah-s3/core";
import { createS3Endpoint } from "@dimah-s3/server/plugins";
import type { ShareOwnerOperations } from "./owner";
import {
  createLinkBodySchema,
  downloadBodySchema,
  fileQuerySchema,
  linkIdQuerySchema,
  listLinksQuerySchema,
  listSharedQuerySchema,
  openLinkQuerySchema,
  unlockLinkBodySchema,
  updateLinkBodySchema,
} from "./schemas";
import type { ShareVisitorOperations } from "./visitor";

/** The endpoints `share()` mounts, keyed by their `shareClient()` action names. */
export type ShareEndpoints = ReturnType<typeof createShareEndpoints>;

/**
 * The share plugin's HTTP endpoints. Guards see each one as
 * `operation: "plugin"` with `plugin: { id: "share", action }`, where
 * `action` is its key:
 *
 * - Owner, with a session: `POST /share/link` (`createLink`),
 *   `GET /share/links` (`listLinks`), `GET /share/link` (`getLink`),
 *   `PATCH /share/link` (`updateLink`), `DELETE /share/link` (`revokeLink`).
 * - Visitor, with a token: `GET /share/open` (`openLink`), `POST /share/unlock`
 *   (`unlockLink`), `GET /share/items` (`listShared`), `POST /share/download`
 *   (`downloadShared`), and `GET /share/file` (`sharedFile`), which streams a
 *   file in proxy mode.
 */
export function createShareEndpoints(
  owner: ShareOwnerOperations,
  visitor: ShareVisitorOperations,
) {
  return {
    createLink: createS3Endpoint(
      pluginPath("share", "link"),
      { method: "POST", body: createLinkBodySchema },
      (ctx) => owner.createLink(ctx.context, ctx.body),
    ),
    listLinks: createS3Endpoint(
      pluginPath("share", "links"),
      { method: "GET", query: listLinksQuerySchema },
      (ctx) => owner.listLinks(ctx.context, ctx.query),
    ),
    getLink: createS3Endpoint(
      pluginPath("share", "link"),
      { method: "GET", query: linkIdQuerySchema },
      (ctx) => owner.getLink(ctx.context, ctx.query),
    ),
    updateLink: createS3Endpoint(
      pluginPath("share", "link"),
      { method: "PATCH", body: updateLinkBodySchema },
      (ctx) => owner.updateLink(ctx.context, ctx.body),
    ),
    revokeLink: createS3Endpoint(
      pluginPath("share", "link"),
      { method: "DELETE", query: linkIdQuerySchema },
      (ctx) => owner.revokeLink(ctx.context, ctx.query),
    ),
    openLink: createS3Endpoint(
      pluginPath("share", "open"),
      { method: "GET", query: openLinkQuerySchema },
      (ctx) => visitor.openLink(ctx.context, ctx.query),
    ),
    unlockLink: createS3Endpoint(
      pluginPath("share", "unlock"),
      { method: "POST", body: unlockLinkBodySchema },
      (ctx) => visitor.unlockLink(ctx.context, ctx.body),
    ),
    listShared: createS3Endpoint(
      pluginPath("share", "items"),
      { method: "GET", query: listSharedQuerySchema },
      (ctx) => visitor.listShared(ctx.context, ctx.query),
    ),
    downloadShared: createS3Endpoint(
      pluginPath("share", "download"),
      { method: "POST", body: downloadBodySchema },
      (ctx) => visitor.downloadShared(ctx.context, ctx.body),
    ),
    sharedFile: createS3Endpoint(
      pluginPath("share", "file"),
      { method: "GET", query: fileQuerySchema },
      (ctx) => visitor.sharedFile(ctx.context, ctx.query),
    ),
  };
}
