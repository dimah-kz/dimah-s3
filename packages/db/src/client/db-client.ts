import { defineClientPlugin, pluginPath } from "@dimah-s3/core";
import type { db } from "@/plugin/db";
import type {
  DbClientActions,
  DbClientFolder,
  DbClientListResponse,
  DbClientObject,
} from "@/types/client";

/**
 * Client plugin for the server `db()` endpoints. Its actions are
 * {@link DbClientActions} on `api.db`. Pass `TClientAttributes` to type the
 * `attributes` the plugin's `attributes.toClient` returns.
 *
 * ```ts
 * import { createS3Client } from "@dimah-s3/react";
 * import { dbClient } from "@dimah-s3/db/client";
 *
 * export const s3Client = createS3Client({
 *   plugins: [dbClient()],
 * });
 *
 * const page = await s3Client.db.listObjects({ folder: "" });
 * ```
 *
 * The server resolves the scope from the request, so no action takes one.
 * Server code skips HTTP and uses `s3.db.objects` and `s3.db.folders`.
 */
export function dbClient<TClientAttributes = never>() {
  return defineClientPlugin({
    id: "db",
    $InferServerPlugin: {} as ReturnType<typeof db>,
    getActions: ($fetch): DbClientActions<TClientAttributes> => ({
      listObjects: (input, init) =>
        $fetch<DbClientListResponse<TClientAttributes>>(
          pluginPath("db", "objects"),
          { method: "GET", query: input, signal: init?.signal },
        ),
      getObject: (input, init) =>
        $fetch<{ object: DbClientObject<TClientAttributes> }>(
          pluginPath("db", "object"),
          { method: "GET", query: input, signal: init?.signal },
        ),
      updateObject: (input, init) =>
        $fetch<{ object: DbClientObject<TClientAttributes> }>(
          pluginPath("db", "object"),
          { method: "PATCH", body: input, signal: init?.signal },
        ),
      createFolder: (input, init) =>
        $fetch<{ folder: DbClientFolder }>(pluginPath("db", "folder"), {
          method: "POST",
          body: input,
          signal: init?.signal,
        }),
      deleteFolder: (input, init) =>
        $fetch<{ path: string }>(pluginPath("db", "folder"), {
          method: "DELETE",
          query: input,
          signal: init?.signal,
        }),
    }),
  });
}
