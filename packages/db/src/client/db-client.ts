import { defineClientPlugin, pluginEndpointPath } from "@dimah-s3/core";
import type {
  DbClientListInput,
  DbClientListResponse,
} from "../types/storage-object";

export type {
  DbClientListInput,
  DbClientListResponse,
  DbClientObject,
} from "../types/storage-object";

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
 * wrapper for `GET plugins/db/objects`.
 */
export function dbClient() {
  return defineClientPlugin({
    id: "db",
    createMethods: (fetcher) => ({
      /**
       * List the caller's objects and usage. Scope comes from server `resolveScope`
       * — not a parameter here. For another scope, use `listByScope` on the server.
       */
      listObjects: (input?: DbClientListInput) =>
        fetcher.get<DbClientListResponse>(
          pluginEndpointPath("db", "objects"),
          input,
        ),
    }),
  });
}
