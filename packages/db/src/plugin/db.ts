import type { S3Client } from "@aws-sdk/client-s3";
import {
  chainHooks,
  definePlugin,
  isFeatureOn,
  type DimahS3Config,
} from "@dimah-s3/server";
import type {
  DimahS3DbClient,
  StorageObjectStore,
} from "@/store/storage-object-store";
import type { ScopeResolver } from "@/types/storage-object";
import { createQuotaGuard } from "@/hooks/create-quota-guard";
import { createDatabaseEndpoints } from "./create-database-endpoints";
import { createDatabaseLifecycleHooks } from "./create-database-lifecycle-hooks";

export type DbPluginOptions = {
  /** FumaDB client (`DimahS3DB.client(adapter)`) or a prebuilt objects store. */
  client: DimahS3DbClient | StorageObjectStore;
  /**
   * Maps a request to its owning scope. `null` rejects with 401. The second
   * argument carries the operation, route, and object key the endpoint
   * already validated.
   */
  resolveScope: ScopeResolver;
  /**
   * How long a `pending` row stays valid before the purge job may remove it.
   * @default 86_400_000 (24h)
   */
  pendingTtlMs?: number;
  /**
   * After a normal server delete (`api.delete` → S3 `DeleteObject`), how the
   * plugin updates the DB row in `onDeleted`: `soft` keeps it with
   * `status = "deleted"`; `hard` removes it. Does not change the S3 delete
   * path — callers still use `api.delete`, not store helpers. Delete also
   * clears a row whose object never landed, and aborts a pending multipart
   * upload by its `uploadId`.
   * @default "soft"
   */
  deleteMode?: "soft" | "hard";
  /**
   * Optional scope usage caps. Numbers come from you — the plugin only
   * checks. Wired as `upload.guard` after ownership.
   */
  quota?: {
    maxBytes?: number;
    maxFiles?: number;
  };
};

export type DbPluginContext = {
  /** `storage_object` data-access layer — listings, quota, resume, custom routes. */
  objects: StorageObjectStore;
  /** Underlying FumaDB client (or the store when one was passed as `client`). */
  client: DimahS3DbClient | StorageObjectStore;
};

/**
 * Persistence plugin for {@link dimahS3} — keeps rows in sync with upload /
 * multipart / download / delete lifecycle and enforces scope ownership.
 *
 * Hooks attach to every route unless the route sets `plugins: { db: false }`.
 *
 * Exposes `GET /db/objects` and `GET /db/object` for the browser via
 * {@link dbClient}.
 *
 * ```ts
 * const s3 = dimahS3({
 *   client: awsS3,
 *   bucket,
 *   plugins: [
 *     db({ client: dimahS3Db, resolveScope }),
 *   ],
 *   routes: {
 *     uploads: route({
 *       upload: true,
 *     }),
 *   },
 * });
 *
 * s3.db.objects.listByScope({ scope });
 * s3.context.db === s3.db;
 * ```
 */
export function db(options: DbPluginOptions) {
  let config: Readonly<DimahS3Config> | undefined;
  const s3Client = (route: string): S3Client | undefined =>
    config?.routes[route]?.client ?? config?.client;
  const { objects, hooks, resolveScope } = createDatabaseLifecycleHooks({
    ...options,
    s3Client,
  });
  if (options.quota && hooks.upload) {
    const quotaGuard = createQuotaGuard({
      client: objects,
      resolveScope,
      maxBytes: options.quota.maxBytes,
      maxFiles: options.quota.maxFiles,
    });
    hooks.upload.guard = chainHooks(hooks.upload.guard, quotaGuard);
  }

  return definePlugin({
    id: "db",
    init(env) {
      config = env.config;
      const routes = Object.values(env.config.routes);
      const hasLifecycle = routes.some(
        (r) =>
          isFeatureOn(r.upload) ||
          isFeatureOn(r.download) ||
          isFeatureOn(r.delete),
      );
      if (!hasLifecycle) {
        throw new Error(
          "[dimah-s3] db plugin requires at least one route with upload, download, or delete enabled.",
        );
      }
    },
    hooks,
    endpoints: createDatabaseEndpoints({ objects, resolveScope }),
    context: {
      objects,
      client: options.client,
    } satisfies DbPluginContext,
  });
}
