import { defineClientPlugin, pluginPath } from "@dimah-s3/core";
import type { db } from "@/plugin/db";
import type {
  DbClientGetInput,
  DbClientListInput,
  DbClientListResponse,
  DbClientObject,
} from "@/types/storage-object";

export type {
  DbClientGetInput,
  DbClientListInput,
  DbClientListResponse,
  DbClientObject,
} from "@/types/storage-object";

/**
 * Client plugin for the server `db()` endpoints.
 *
 * ```ts
 * import { createS3Client } from "@dimah-s3/react";
 * import { dbClient } from "@dimah-s3/db/client";
 *
 * export const { api, useApi } = createS3Client({
 *   plugins: [dbClient()],
 * });
 *
 * await api.db.listObjects({ limit: 50 });
 * ```
 *
 * Server code does not use `listObjects` — it calls `s3.db.objects.listByScope`
 * and `getScopeUsage` directly (no HTTP round-trip). `listObjects` is the browser
 * wrapper for `GET /db/objects`.
 */
export function dbClient() {
  return defineClientPlugin({
    id: "db",
    $InferServerPlugin: {} as ReturnType<typeof db>,
    getActions: ($fetch) => ({
      /**
       * List the caller's objects and usage. Scope comes from server `resolveScope`
       * — not a parameter here. For another scope, use `listByScope` on the server.
       */
      listObjects: (input?: DbClientListInput) =>
        $fetch<DbClientListResponse>(pluginPath("db", "objects"), {
          method: "GET",
          query: input,
        }),
      getObject: (input: DbClientGetInput) =>
        $fetch<{ object: DbClientObject }>(pluginPath("db", "object"), {
          method: "GET",
          query: input,
        }),
    }),
  });
}
