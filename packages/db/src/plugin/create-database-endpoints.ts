import { createEndpoint } from "@dimah-s3/server";
import { unauthorized } from "../errors";
import type { StorageObjectStore } from "../store/storage-object-store";
import type {
  DbClientListResponse,
  ScopeResolver,
  StorageObjectStatus,
} from "../types/storage-object";
import { toDbClientObject } from "./to-db-client-object";

const STATUSES = new Set<StorageObjectStatus>(["pending", "active", "deleted"]);

function parseStatus(value: string | null): StorageObjectStatus | undefined {
  if (value == null || value === "") return undefined;
  if (!STATUSES.has(value as StorageObjectStatus)) return undefined;
  return value as StorageObjectStatus;
}

function parseNonNegativeInt(value: string | null): number | undefined {
  if (value == null || value === "") return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  return Math.max(0, Math.floor(n));
}

/**
 * HTTP endpoints for the `db` plugin — mounted under `plugins/db/…`.
 */
export function createDatabaseEndpoints(options: {
  objects: StorageObjectStore;
  resolveScope: ScopeResolver;
}) {
  return {
    objects: createEndpoint(
      "objects",
      { method: "GET" },
      async ({ request, url }): Promise<DbClientListResponse> => {
        const scope = await options.resolveScope(request);
        if (scope === null) throw unauthorized();

        const status = parseStatus(url.searchParams.get("status"));
        const limit = parseNonNegativeInt(url.searchParams.get("limit"));
        const offset = parseNonNegativeInt(url.searchParams.get("offset"));

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
