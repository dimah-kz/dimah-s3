import type { S3Client } from "@aws-sdk/client-s3";
import type { S3ErrorCatalog } from "@dimah-s3/core";
import type { Endpoint } from "better-call";
import type {
  DeleteConfig,
  DimahS3Config,
  DimahS3Logger,
  DownloadConfig,
  MultipartConfig,
  S3ServerCallOptions,
  TicketSubject,
  UploadConfig,
} from "@/types/config";
import type { GuardContext, RouteGuardContext } from "@/types/hook-contexts";
import type { DimahS3RoutePluginOptions, Guard } from "@/types/locals";

/**
 * Hooks a plugin adds. Plugin hooks run before the user's hook for the same
 * slot, in plugin order, for guards and lifecycle hooks alike. A route that
 * sets `plugins: { [id]: false }` skips the plugin's route hooks.
 */
export type DimahS3PluginHooks = {
  /** Runs before every operation, before the user's instance guard. */
  guard?: Guard<GuardContext>;
  /**
   * Binds upload tickets to a subject when the config sets no
   * `ticketSubject`. The first plugin that provides one is used.
   */
  ticketSubject?: TicketSubject;
  upload?: Pick<
    UploadConfig,
    "guard" | "onStart" | "confirmGuard" | "onConfirmed" | "onRejected"
  > & { multipart?: Pick<MultipartConfig, "guard" | "onAbort"> };
  download?: Pick<DownloadConfig, "guard" | "onPresigned">;
  delete?: Pick<DeleteConfig, "guard" | "onDeleted">;
};

/**
 * A plugin's options on a route, from its {@link DimahS3RoutePluginOptions}
 * augmentation: `db` gives `DbRouteOptions`. Without one it is `object`.
 */
export type PluginRouteOptions<Id extends string> = Exclude<
  DimahS3RoutePluginOptions[Id],
  false | undefined
>;

/**
 * A route after `dimahS3()` checked it: the client and bucket it inherits,
 * its key namespace, which features are on, and this plugin's options.
 * Read-only.
 */
export type PluginRoute<Id extends string = string> = {
  readonly name: string;
  /** The route's S3 client, or the instance one. */
  readonly client: S3Client;
  /** The route's bucket, or the instance one. */
  readonly bucket: string;
  /**
   * Object-key namespace. Uploads write under it, and other operations
   * reject keys outside it. `false` means keys are not namespace-checked.
   * Check a key with `assertStoredKey(key, route.keyPrefix)`.
   */
  readonly keyPrefix: string | false;
  /**
   * This plugin's options for the route (`plugins[id]`). `false`: the route
   * turned the plugin off, and its route hooks do not run there.
   * `undefined`: the route sets nothing.
   */
  readonly options: PluginRouteOptions<Id> | false | undefined;
  readonly upload: Readonly<
    | { enabled: false }
    | {
        enabled: true;
        fileTypes?: readonly string[];
        maxFileSize?: number;
        multipart: boolean;
      }
  >;
  readonly download: Readonly<
    { enabled: false } | { enabled: true; mode: "presign" | "proxy" }
  >;
  readonly delete: Readonly<{ enabled: boolean }>;
};

/** What a plugin's in-process call names. */
export type PluginOperationTarget = {
  /**
   * What the call does, such as `"record"`. Guards see it as
   * `plugin.action`, next to the plugin id.
   */
  action: string;
  /**
   * The named route the call is about. Its route guard runs after the
   * instance guards, and the context carries `route`. A missing route is
   * `ROUTE_NOT_FOUND`.
   */
  route?: string;
};

/** Runs one in-process plugin call. See {@link PluginInitEnv.runOperation}. */
export type PluginRunOperation = {
  <T>(
    target: PluginOperationTarget & { route: string },
    options: S3ServerCallOptions | undefined,
    run: (context: RouteGuardContext) => Promise<T>,
  ): Promise<T>;
  <T>(
    target: PluginOperationTarget,
    options: S3ServerCallOptions | undefined,
    run: (context: GuardContext) => Promise<T>,
  ): Promise<T>;
};

/** What {@link DimahS3Plugin.init} receives. */
export type PluginInitEnv<Id extends string = string> = {
  /** The user config. The routes are already validated. */
  config: Readonly<DimahS3Config>;
  /**
   * Every route as `dimahS3()` resolved it, keyed by name. Read the bucket,
   * client, key namespace, and file limits here instead of from `config`.
   */
  routes: Readonly<Record<string, PluginRoute<Id>>>;
  /** Looks up a registered plugin by id. */
  getPlugin: (id: string) => DimahS3Plugin | undefined;
  /**
   * This plugin's options for a route (`routes[route].plugins[id]`), typed
   * by the plugin's `DimahS3RoutePluginOptions` augmentation. `false` means
   * the route turned the plugin off, and `undefined` means the route sets
   * nothing or does not exist.
   */
  routeOptions: <T extends object = PluginRouteOptions<Id>>(
    route: string,
  ) => T | false | undefined;
  /** The instance logger. */
  logger: DimahS3Logger;
  /**
   * Runs an in-process call the way `s3.api` runs one, for a context
   * method such as `s3.db.record`:
   *
   * 1. The request is `options.request`, or one built from `baseURL`,
   *    `options.headers`, and `options.signal`. `options.locals` seeds
   *    `locals`.
   * 2. The instance guards run (every plugin's, then the user's) with
   *    `operation: "plugin"` and `plugin: { id, action }`. With a `route`,
   *    its route guard runs next.
   * 3. `run` gets that context. Every failure leaves as an `APIError`:
   *    anything else is logged, passed to `onError`, and becomes
   *    `500 INTERNAL_ERROR`.
   *
   * ```ts
   * record: (input, call) =>
   *   env.runOperation({ action: "record", route: input.route }, call, (context) =>
   *     recordObject(context, input),
   *   ),
   * ```
   */
  runOperation: PluginRunOperation;
};

/**
 * A server plugin, such as `db()` from `@dimah-s3/db`. Build one with
 * `definePlugin` so its types are kept.
 *
 * @typeParam Id - The plugin id. It keys `s3.context` and the instance
 *   (`s3[id]`).
 * @typeParam TContext - The value on `s3.context[id]` and `s3[id]`.
 * @typeParam TEndpoints - The plugin's endpoints. A client plugin that
 *   points `$InferServerPlugin` at this plugin gets a `$fetch` typed by
 *   them.
 * @typeParam TErrorCodes - The plugin's `$ERROR_CODES`.
 */
export type DimahS3Plugin<
  Id extends string = string,
  TContext extends Record<string, unknown> = Record<string, unknown>,
  TEndpoints extends Record<string, Endpoint> = Record<string, Endpoint>,
  TErrorCodes extends S3ErrorCatalog = Record<never, never>,
> = {
  /**
   * Unique id: a letter, then up to 63 letters, digits, `_`, or `-`. A
   * duplicate or an instance key such as `api` throws.
   */
  id: Id;
  /**
   * Ids of plugins that must be registered too. A missing or circular
   * dependency throws at `dimahS3()`. Hooks still run in plugin order.
   */
  dependsOn?: readonly string[];
  /**
   * Runs once at `dimahS3()`, in plugin order, after the routes are
   * validated. Keep the env to call `runOperation` and read `routes` later.
   * Throw here to reject the config. It must be synchronous: returning a
   * promise throws.
   */
  init?(env: PluginInitEnv<Id>): void;
  hooks?: DimahS3PluginHooks;
  /**
   * HTTP endpoints mounted on the handler under `basePath`. Build them with
   * `createS3Endpoint`. They are not added to `s3.api`. Guards see a call
   * to one as `operation: "plugin"` with `plugin: { id, action }`, where
   * `action` is its key here.
   */
  endpoints?: TEndpoints;
  /**
   * Error codes the plugin throws, built with `defineErrorCodes` and thrown
   * with `s3Error(entry, params)`. Merged into `s3.$ERROR_CODES`. A code
   * the core catalog or another plugin already has throws at `dimahS3()`.
   */
  $ERROR_CODES?: TErrorCodes;
  /** Exposed on `s3.context[id]` and `s3[id]`. */
  context?: TContext;
};

/** Plugin ids mapped to their `context` types. */
export type PluginContextMap<P extends readonly DimahS3Plugin[]> = {
  [K in P[number] as K["id"]]: K extends DimahS3Plugin<string, infer Ctx>
    ? Ctx
    : never;
};

type UnionToIntersection<U> = (
  U extends unknown ? (value: U) => void : never
) extends (value: infer I) => void
  ? I
  : never;

/** Every plugin's `$ERROR_CODES`, merged. */
export type PluginErrorCodes<P extends readonly DimahS3Plugin[]> =
  UnionToIntersection<
    P[number] extends infer K
      ? K extends { $ERROR_CODES?: infer C }
        ? NonNullable<C>
        : never
      : never
  >;

/** What `applyPlugins` returns to `dimahS3()`. */
export type AppliedPlugins<C> = {
  /** Plugin contexts keyed by plugin id. */
  context: C;
  getPlugin: (id: string) => DimahS3Plugin | undefined;
  /** Every plugin endpoint, keyed by name, to mount beside the core ones. */
  endpoints: Record<string, Endpoint>;
  /** The core catalog with every plugin's `$ERROR_CODES` added. */
  errorCodes: S3ErrorCatalog;
};
