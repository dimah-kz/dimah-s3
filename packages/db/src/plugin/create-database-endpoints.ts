import { pluginPath } from "@dimah-s3/core";
import { createS3Endpoint } from "@dimah-s3/server";
import { notFound, unauthorized } from "@/errors";
import type { StorageObjectStore } from "@/store/storage-object-store";
import { encodeListCursor } from "@/store/list-cursor";
import type {
  DbClientListResponse,
  DbClientObject,
  ScopeResolver,
} from "@/types/storage-object";
import {
  dbGetQuerySchema,
  dbListQuerySchema,
  DB_LIST_DEFAULT_LIMIT,
} from "./list-query-schema";
import { toDbClientObject } from "./to-db-client-object";

export {
  dbListQuerySchema,
  dbGetQuerySchema,
  DB_LIST_DEFAULT_LIMIT,
  DB_LIST_MAX_LIMIT,
} from "./list-query-schema";

/**
 * HTTP endpoints for the `db` plugin — `GET /db/objects` and `GET /db/object`.
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
          cursor,
          route,
          contentType,
          prefix,
        } = ctx.query ?? {};

        const fetchLimit = limit + 1;
        const [rows, usage] = await Promise.all([
          options.objects.listByScope({
            scope,
            status: status ?? "active",
            limit: fetchLimit,
            offset,
            cursor,
            route,
            contentType,
            prefix,
          }),
          options.objects.getScopeUsage(scope),
        ]);

        const hasMore = rows.length > limit;
        const page = hasMore ? rows.slice(0, limit) : rows;
        const last = page.at(-1);
        const nextCursor =
          hasMore && last
            ? encodeListCursor(last.createdAt, last.id)
            : null;

        return {
          scope,
          usage,
          objects: page.map(toDbClientObject),
          nextCursor,
        };
      },
    ),
    object: createS3Endpoint(
      pluginPath("db", "object"),
      { method: "GET", query: dbGetQuerySchema },
      async (ctx): Promise<{ object: DbClientObject }> => {
        const scope = await options.resolveScope(ctx.context.request);
        if (scope === null) throw unauthorized();
        const found = await options.objects.findByScopeKey({
          scope,
          key: ctx.query.key,
          bucket: ctx.query.bucket,
        });
        if (!found || found.status === "deleted") throw notFound();
        return { object: toDbClientObject(found) };
      },
    ),
  };
}
