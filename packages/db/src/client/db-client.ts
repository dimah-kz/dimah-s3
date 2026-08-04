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
 * await api.db.listObjects();
 * ```
 */
export function dbClient() {
  return defineClientPlugin({
    id: "db",
    createMethods: (fetcher) => ({
      listObjects: (input?: DbClientListInput) =>
        fetcher.get<DbClientListResponse>(
          pluginEndpointPath("db", "objects"),
          input,
        ),
    }),
  });
}
