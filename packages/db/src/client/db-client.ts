import {
  defineClientPlugin,
  pluginPath,
  type S3RequestOptions,
} from "@dimah-s3/core";
import type { db } from "@/plugin/db";
import type {
  DbClientActions,
  DbClientFolder,
  DbClientListInput,
  DbClientListResponse,
  DbClientObject,
} from "@/types/client";

/** The per-call options better-fetch reads: the abort signal and headers. */
function call(options: S3RequestOptions | undefined) {
  return { signal: options?.signal, headers: options?.headers };
}

/** The list query on the wire, where the root folder is `""`. */
function listQuery(input: DbClientListInput | undefined) {
  if (input?.folder !== null) return input;
  return { ...input, folder: "" };
}

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
      listObjects: (input, options) =>
        $fetch<DbClientListResponse<TClientAttributes>>(
          pluginPath("db", "objects"),
          { method: "GET", query: listQuery(input), ...call(options) },
        ),
      getObject: (input, options) =>
        $fetch<{ object: DbClientObject<TClientAttributes> }>(
          pluginPath("db", "object"),
          { method: "GET", query: input, ...call(options) },
        ),
      updateObject: (input, options) =>
        $fetch<{ object: DbClientObject<TClientAttributes> }>(
          pluginPath("db", "object"),
          { method: "PATCH", body: input, ...call(options) },
        ),
      createFolder: (input, options) =>
        $fetch<{ folder: DbClientFolder }>(pluginPath("db", "folder"), {
          method: "POST",
          body: input,
          ...call(options),
        }),
      deleteFolder: (input, options) =>
        $fetch<{ path: string }>(pluginPath("db", "folder"), {
          method: "DELETE",
          query: input,
          ...call(options),
        }),
    }),
  });
}
