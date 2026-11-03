import type { S3Client } from "@aws-sdk/client-s3";
import {
  definePlugin,
  isFeatureOn,
  type DimahS3Plugin,
  type PluginInitEnv,
} from "@dimah-s3/server/plugins";
import { createDbStore } from "@/store/create-db-store";
import type { DbPluginOptions, DbRouteOptions } from "@/types/plugin";
import type { StorageObject } from "@/types/storage-object";
import { createDatabaseEndpoints } from "./create-database-endpoints";
import {
  createDatabaseLifecycleHooks,
  type DbRoutes,
} from "./create-database-lifecycle-hooks";
import { createObjectAccess } from "./object-access";
import {
  createPublicStores,
  type DbFolders,
  type DbObjects,
} from "./public-stores";
import { createPurge, type Purge } from "./purge";
import { createQuota } from "./quota";
import { createScopeResolver } from "./scope";
import { toDbClientObject } from "./to-db-client-object";

/** What `db()` exposes on `s3.db` and `s3.context.db`. */
export type DbPluginContext<TAttributes = never> = {
  /** The `storage_object` rows: listings, usage, and your own changes. */
  objects: DbObjects<TAttributes>;
  /** The `storage_folder` rows. */
  folders: DbFolders;
  /**
   * Throws unless the database is at the schema this version needs. Call it
   * at startup to fail fast; the first query runs the same check.
   */
  checkSchema: () => Promise<void>;
} & Purge;

/**
 * Database plugin for `dimahS3()`. It tracks each upload in `storage_object`
 * from start to delete, binds upload tickets to the caller's scope, and
 * rejects calls on objects of another scope. It mounts `GET /db/objects`,
 * `GET /db/object`, `PATCH /db/object`, and the folder endpoints for
 * `dbClient()`.
 *
 * Every route is tracked unless it sets `plugins: { db: false }`.
 *
 * ```ts
 * const s3 = dimahS3({
 *   client: awsS3,
 *   bucket,
 *   plugins: [
 *     db({
 *       client: DimahS3DB.client(adapter),
 *       getSession: (request) => auth.getSession(request),
 *       resolveScope: ({ session }) => (session ? `user:${session.userId}` : null),
 *       quota: { maxBytes: 1024 ** 3 },
 *     }),
 *   ],
 *   routes: { uploads: route({ upload: true, download: true, delete: true }) },
 * });
 *
 * await s3.db.purgeStale();
 * ```
 */
export function db<
  TSession = undefined,
  TAttributes = never,
  TClientAttributes = TAttributes,
>(
  options: DbPluginOptions<TSession, TAttributes, TClientAttributes>,
): DimahS3Plugin<"db", DbPluginContext<TAttributes>> {
  let env: PluginInitEnv | undefined;
  const routes: DbRoutes = {
    tracked: (route) => env?.routeOptions(route) !== false,
    replace: (route) => {
      const routeOptions = env?.routeOptions<DbRouteOptions>(route);
      return routeOptions ? routeOptions.replace : undefined;
    },
    client: (route) => routeClient(env, route),
  };

  const store = createDbStore<TAttributes>(options.client);
  const stores = createPublicStores(store);
  const resolveScope = createScopeResolver(options);
  const toClientObject = (object: StorageObject<TAttributes>) =>
    toDbClientObject(object, options.attributes?.toClient);
  const access = createObjectAccess({
    objects: store.objects,
    resolveScope,
    authorize: options.authorize,
  });
  const quota = createQuota(store.objects, options.quota);
  const purge = createPurge({
    objects: store.objects,
    client: routes.client,
    logger: () => env?.logger,
  });

  return definePlugin({
    id: "db",
    init(initEnv) {
      env = initEnv;
      warnUnguardedRoutes(initEnv);
    },
    hooks: createDatabaseLifecycleHooks({
      store,
      resolveScope,
      access,
      quota,
      deleteMode: options.deleteMode,
      routes,
    }),
    endpoints: createDatabaseEndpoints({
      store,
      objects: stores.objects,
      access,
      resolveScope,
      quota,
      attributes: options.attributes,
      toClientObject,
    }),
    context: {
      objects: stores.objects,
      folders: stores.folders,
      checkSchema: store.checkSchema,
      purgeStale: purge.purgeStale,
      pruneDeleted: purge.pruneDeleted,
    },
  });
}

function routeClient(
  env: PluginInitEnv | undefined,
  route: string,
): S3Client | undefined {
  if (!env) return undefined;
  const { routes, client } = env.config;
  const config = Object.hasOwn(routes, route) ? routes[route] : undefined;
  return config?.client ?? client;
}

/**
 * Warns once per route that turns db off while its download or delete has
 * no route or feature guard: nothing then checks who owns the object.
 */
function warnUnguardedRoutes(env: PluginInitEnv): void {
  for (const [name, route] of Object.entries(env.config.routes)) {
    if (env.routeOptions(name) !== false || route.guard) continue;
    const unguarded = (["download", "delete"] as const).filter((feature) => {
      const toggle = route[feature];
      if (!isFeatureOn(toggle)) return false;
      return typeof toggle !== "object" || !toggle.guard;
    });
    if (unguarded.length === 0) continue;
    env.logger.warn?.(
      `[dimah-s3/db] Route "${name}" sets plugins: { db: false } and has no guard on ${unguarded.join(" or ")}, so any caller can reach every object on it. Add a route or feature guard.`,
    );
  }
}
