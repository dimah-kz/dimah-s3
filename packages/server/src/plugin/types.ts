import type { S3Client } from "@aws-sdk/client-s3";
import type { ContentDispositionType, S3ErrorCatalog } from "@dimah-s3/core";
import type { PluginTokens } from "@/helpers/plugin-tokens";
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
    | { enabled: false }
    | {
        enabled: true;
        mode: "presign" | "proxy";
        /** The route's default `Content-Disposition`. */
        disposition: ContentDispositionType;
      }
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

/** The object a plugin download sends. See {@link PluginDownloads}. */
export type PluginDownloadInput = {
  /** Named route of the object. Its download must be on. */
  route: string;
  /** Object key, inside the route namespace (`KEY_INVALID` otherwise). */
  key: string;
  /** File name the browser saves. Defaults to the stored name, else the key. */
  name?: string;
  /**
   * `inline` is kept only for a type on the route's `inlineTypes`.
   * @default the route's `download.disposition`
   */
  disposition?: ContentDispositionType;
};

/** A presigned GET from {@link PluginDownloads.presign}. */
export type PluginSignedDownload = {
  url: string;
  /** The disposition the URL carries, after the `inlineTypes` check. */
  disposition: ContentDispositionType;
  /** URL lifetime in seconds. */
  expiresIn: number;
};

/**
 * Sends a stored object the way the route's download sends it, for a plugin
 * that checked access itself, such as a share link. No guard,
 * `download.resolve`, or download hook runs: the plugin is the access
 * check. Pick the method by the route's `download.mode`.
 */
export type PluginDownloads = {
  /**
   * A presigned GetObject, for a route in `presign` mode. HeadObject reads
   * the stored type first. `expiresIn` (seconds) is capped by the route
   * `download.maxExpiresIn`, which is also the default.
   * @throws `ROUTE_NOT_FOUND`, `FEATURE_DISABLED` when the route's download
   * is off, `KEY_INVALID`, or `OBJECT_NOT_FOUND`. A route in `proxy` mode
   * is a plugin bug and throws a `TypeError`: use `serve` there.
   */
  presign: (
    input: PluginDownloadInput & { expiresIn?: number; signal?: AbortSignal },
  ) => Promise<PluginSignedDownload>;
  /**
   * The `GET /file` response for `request`, for a route in `proxy` mode:
   * one GetObject with the request's Range and conditional headers and its
   * abort signal, sent with the `/file` hardening headers.
   * @throws the `APIError` `/file` returns, with the hardening headers. A
   * route in `presign` mode throws a `TypeError`: use `presign` there.
   */
  serve: (
    input: PluginDownloadInput & {
      /** @default "private, no-cache" */
      cacheControl?: string;
    },
    request: Request,
  ) => Promise<Response>;
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
  /**
   * The URL of an API path such as `pluginPath("share", "file")`: under
   * `baseURL` when it is set, else under `basePath`, the way proxy download
   * URLs are built.
   */
  url: (path: string) => string;
  /** Presigns or streams an object the plugin authorized itself. */
  download: PluginDownloads;
  /**
   * Signs and verifies short-lived tokens with the instance secret (the
   * same one upload tickets use), under a key derived for this plugin and
   * `purpose`. A token never verifies for another purpose or plugin.
   *
   * ```ts
   * const grants = env.tokens("grant");
   * const token = await grants.sign({ id: link.id }, { expiresIn: 300 });
   * const payload = await grants.verify(token); // `null` when expired or forged
   * ```
   */
  tokens: (purpose: string) => PluginTokens;
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
