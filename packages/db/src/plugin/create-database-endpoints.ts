import { pluginPath } from "@dimah-s3/core";
import { createS3Endpoint } from "@dimah-s3/server";
import { unauthorized } from "../errors";
import type { StorageObjectStore } from "../store/storage-object-store";
import type {
  DbClientListResponse,
  ScopeResolver,
} from "../types/storage-object";
import { dbListQuerySchema, DB_LIST_DEFAULT_LIMIT } from "./list-query-schema";
import { toDbClientObject } from "./to-db-client-object";

export {
  dbListQuerySchema,
  DB_LIST_DEFAULT_LIMIT,
  DB_LIST_MAX_LIMIT,
} from "./list-query-schema";

/**
 * HTTP endpoints for the `db` plugin — `GET /db/objects`.
 *
 * Browser `api.db.listObjects` maps to the `objects` handler below.
 * Server apps list via `StorageObjectStore.listByScope` instead.
 */
export function createDatabaseEndpoints(options: {
  objects: StorageObjectStore;
  resolveScope: ScopeResolver;
}) {
  return {
    /** List objects + usage for the request scope (`resolveScope`). */
    objects: createS3Endpoint(
      pluginPath("db", "objects"),
      { method: "GET", query: dbListQuerySchema },
      async (ctx): Promise<DbClientListResponse> => {
        const scope = await options.resolveScope(ctx.context.request);
        if (scope === null) throw unauthorized();

        const {
          status,
          limit = DB_LIST_DEFAULT_LIMIT,
          offset,
        } = ctx.query ?? {};

        const [rows, usage] = await Promise.all([
          options.objects.listByScope({
            scope,
            status,
            limit,
            offset,
          }),
          options.objects.getScopeUsage(scope),
        ]);

        return {
          scope,
          usage,
          objects: rows.map(toDbClientObject),
        };
      },
    ),
  };
}
