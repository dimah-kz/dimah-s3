import {
  defineClientPlugin,
  pluginPath,
  type S3RequestOptions,
} from "@dimah-s3/core";
import { SHARE_ERROR_CODES } from "@/error-codes";
// Type only: the server plugin never reaches the browser bundle.
import type { share } from "@/plugin/share";
import type { ShareClientActions } from "@/types/client";
import { listLinksQuery, listSharedQuery } from "@/wire";

/** The per-call options better-fetch reads: the abort signal and headers. */
function call(options: S3RequestOptions | undefined) {
  return { signal: options?.signal, headers: options?.headers };
}

/**
 * Client plugin for the server `share()` endpoints. Its actions are
 * {@link ShareClientActions} on `api.share`, and its error codes are on
 * `api.$ERROR_CODES`.
 *
 * ```ts
 * import { createS3Client } from "@dimah-s3/react";
 * import { dbClient } from "@dimah-s3/db/client";
 * import { shareClient } from "@dimah-s3/share/client";
 *
 * export const s3Client = createS3Client({
 *   plugins: [dbClient(), shareClient()],
 * });
 *
 * const { link } = await s3Client.share.createLink({
 *   target: { type: "object", key },
 *   expiresAt: new Date(Date.now() + 7 * 864e5),
 * });
 * ```
 *
 * Owner actions run as the signed-in caller. Visitor actions (`openLink`,
 * `unlockLink`, `listShared`, `downloadShared`) take the link `token`
 * instead, so a public page can call them without a session.
 */
export function shareClient() {
  return defineClientPlugin({
    id: "share",
    // Types `$fetch` by the endpoints `share()` mounts, so a response that
    // drifts from `ShareClientActions` fails to compile here.
    $InferServerPlugin: {} as ReturnType<typeof share>,
    $ERROR_CODES: SHARE_ERROR_CODES,
    getActions: ($fetch): ShareClientActions => ({
      createLink: (input, options) =>
        $fetch(pluginPath("share", "link"), {
          method: "POST",
          body: input,
          ...call(options),
        }),
      listLinks: (input, options) =>
        $fetch(pluginPath("share", "links"), {
          method: "GET",
          query: listLinksQuery(input),
          ...call(options),
        }),
      getLink: (input, options) =>
        $fetch(pluginPath("share", "link"), {
          method: "GET",
          query: input,
          ...call(options),
        }),
      updateLink: (input, options) =>
        $fetch(pluginPath("share", "link"), {
          method: "PATCH",
          body: input,
          ...call(options),
        }),
      revokeLink: (input, options) =>
        $fetch(pluginPath("share", "link"), {
          method: "DELETE",
          query: input,
          ...call(options),
        }),
      openLink: (input, options) =>
        $fetch(pluginPath("share", "open"), {
          method: "GET",
          query: input,
          ...call(options),
        }),
      unlockLink: (input, options) =>
        $fetch(pluginPath("share", "unlock"), {
          method: "POST",
          body: input,
          ...call(options),
        }),
      listShared: (input, options) =>
        $fetch(pluginPath("share", "items"), {
          method: "GET",
          query: listSharedQuery(input),
          ...call(options),
        }),
      downloadShared: (input, options) =>
        $fetch(pluginPath("share", "download"), {
          method: "POST",
          body: input,
          ...call(options),
        }),
    }),
  });
}
