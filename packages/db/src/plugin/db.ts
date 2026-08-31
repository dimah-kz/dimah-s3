import { definePlugin } from "@dimah-s3/server";
import {
  type DimahS3DbClient,
  type StorageObjectStore,
} from "@/store/storage-object-store";
import type { ScopeResolver } from "@/types/storage-object";
import { createDatabaseEndpoints } from "./create-database-endpoints";
import { createDatabaseLifecycleHooks } from "./create-database-lifecycle-hooks";

export type DbPluginOptions = {
  /** FumaDB client (`DimahS3DB.client(adapter)`) or a prebuilt objects store. */
  client: DimahS3DbClient | StorageObjectStore;
  /** Maps a request to its owning scope. `null` rejects with 401. */
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
   * path — callers still use `api.delete`, not store helpers.
   * @default "soft"
   */
  deleteMode?: "soft" | "hard";
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
 * Identity stays `(bucket, key)` — no schema change for named routes.
 *
 * Exposes `GET /db/objects` for browser listing via {@link dbClient}.
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
     *       download: true,
     *       delete: true,
     *     }),
 *   },
 * });
 *
 * s3.db.objects.listByScope({ scope });
 * s3.context.db === s3.db;
 * ```
 */
export function db(options: DbPluginOptions) {
  const { objects, hooks } = createDatabaseLifecycleHooks(options);

  return definePlugin({
    id: "db",
    init({ config }) {
      const routes = Object.values(config.routes ?? {});
      const hasLifecycle = routes.some(
        (r) =>
          r.upload !== false ||
          Boolean(r.download) ||
          Boolean(r.delete) ||
          r.multipart === true,
      );
      if (!hasLifecycle) {
        throw new Error(
          "[dimah-s3] db plugin requires at least one route with upload, download, delete, or multipart enabled.",
        );
      }
    },
    hooks,
    endpoints: createDatabaseEndpoints({
      objects,
      resolveScope: options.resolveScope,
    }),
    context: {
      objects,
      client: options.client,
    } satisfies DbPluginContext,
  });
}
