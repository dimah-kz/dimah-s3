import {
  definePlugin,
  type DimahS3Plugin,
  type PluginInitEnv,
} from "@dimah-s3/server/plugins";
import { createDbStore } from "@/store/create-db-store";
import type { DbPluginOptions } from "@/types/plugin";
import type { StorageObject } from "@/types/storage-object";
import {
  createDatabaseEndpoints,
  type DbEndpoints,
} from "./create-database-endpoints";
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
import {
  createRecord,
  type RecordObjectCall,
  type RecordObjectInput,
} from "./record";
import { createScopeResolver } from "./scope";
import { toDbClientObject } from "./to-db-client-object";

/** What `db()` exposes on `s3.db` and `s3.context.db`. */
export type DbPluginContext<TAttributes = never> = {
  /** The `storage_object` rows: listings, usage, and your own changes. */
  objects: DbObjects<TAttributes>;
  /** The `storage_folder` rows. */
  folders: DbFolders;
  /**
   * Writes an active row for an object already in the bucket. It HEADs the
   * object, runs the instance and route guards, then the scope, authorize,
   * route file limits, and quota. It does not copy or delete bytes.
   */
  record: (
    input: RecordObjectInput,
    call?: RecordObjectCall,
  ) => Promise<StorageObject<TAttributes>>;
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
 * `dbClient()`. Guards see a call to one as `operation: "plugin"` with
 * `plugin: { id: "db", action }`, where `action` is the `dbClient()`
 * method name, such as `"listObjects"`.
 *
 * Every route is tracked unless it sets `plugins: { db: false }`.
 *
 * ```ts
 * const s3 = dimahS3({
 *   client: awsS3,
 *   bucket,
 *   plugins: [
 *     db({
 *       client: DimahS3Db.client(adapter),
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
): DimahS3Plugin<
  "db",
  DbPluginContext<TAttributes>,
  DbEndpoints<TSession, TAttributes, TClientAttributes>
> {
  let env: PluginInitEnv<"db"> | undefined;
  const routes: DbRoutes = {
    tracked: (route) => env?.routeOptions(route) !== false,
    replace: (route) => {
      const routeOptions = env?.routeOptions(route);
      return routeOptions ? routeOptions.replace : undefined;
    },
    client: (route) => env?.routes[route]?.client,
  };

  const store = createDbStore<TAttributes>(options.client);
  const stores = createPublicStores(store);
  const resolveScope = createScopeResolver(options);
  const toClientObject = (object: StorageObject<TAttributes>) =>
    toDbClientObject(object, options.attributes?.toClient);
  const access = createObjectAccess({
    objects: store.objects,
    folders: store.folders,
    resolveScope,
    authorize: options.authorize,
  });
  const quota = createQuota(store.objects, options.quota);
  const purge = createPurge({
    objects: store.objects,
    client: routes.client,
    logger: () => env?.logger,
  });
  const record = createRecord({
    store,
    resolveScope,
    access,
    quota,
    env: () => env,
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
      buckets: () =>
        new Set(Object.values(env?.routes ?? {}).map((route) => route.bucket)),
    }),
    context: {
      objects: stores.objects,
      folders: stores.folders,
      record,
      checkSchema: store.checkSchema,
      purgeStale: purge.purgeStale,
      pruneDeleted: purge.pruneDeleted,
    },
  });
}

/**
 * Warns once per route that turns db off while its download or delete has
 * no route or feature guard: nothing then checks who owns the object.
 */
function warnUnguardedRoutes(env: PluginInitEnv<"db">): void {
  for (const route of Object.values(env.routes)) {
    // The route's own guards are user config; `routes` holds the rest.
    const config = env.config.routes[route.name];
    if (route.options !== false || config.guard) continue;
    const unguarded = (["download", "delete"] as const).filter((feature) => {
      if (!route[feature].enabled) return false;
      const toggle = config[feature];
      return typeof toggle !== "object" || !toggle.guard;
    });
    if (unguarded.length === 0) continue;
    env.logger.warn?.(
      `[dimah-s3/db] Route "${route.name}" sets plugins: { db: false } and has no guard on ${unguarded.join(" or ")}, so any caller can reach every object on it. Add a route or feature guard.`,
    );
  }
}
