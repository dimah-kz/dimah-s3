import type { ServerErrors } from "../errors";
import type {
  DeleteConfig,
  DownloadConfig,
  MultipartConfig,
  UploadConfig,
  DimahS3Config,
} from "../types/config";

export type { ServerErrors };

/**
 * Hook fields a plugin may contribute. Scalars like `enabled` / `method`
 * stay user-owned on {@link DimahS3Config}.
 */
export type DimahS3PluginHooks = {
  guard?: DimahS3Config["guard"];
  upload?: Pick<
    UploadConfig,
    "presignGuard" | "onPresigned" | "confirmGuard" | "onConfirmed"
  >;
  download?: Pick<DownloadConfig, "presignGuard" | "onPresigned">;
  delete?: Pick<DeleteConfig, "guard" | "onDeleted">;
  multipart?: Pick<
    MultipartConfig,
    | "initGuard"
    | "partGuard"
    | "completeGuard"
    | "abortGuard"
    | "listGuard"
    | "onInit"
    | "onComplete"
    | "onAbort"
    | "onList"
  >;
};

/**
 * Context passed to a plugin endpoint handler.
 * Global `config.guard` already ran before this is invoked.
 */
export type PluginEndpointContext = {
  request: Request;
  url: URL;
  config: Readonly<DimahS3Config>;
  /** English error factories with stable `code` for client localization. */
  errors: ServerErrors;
  /** Parse the request JSON body (returns `null` when missing/invalid). */
  json: <T extends Record<string, unknown>>() => Promise<T | null>;
};

/** HTTP endpoint contributed by a server plugin. */
export type PluginEndpoint = {
  /** Relative path under `plugins/{id}/` (e.g. `"objects"` → `plugins/db/objects`). */
  path: string;
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  /** Optional HTTP status for successful JSON responses. */
  status?: number;
  handler: (ctx: PluginEndpointContext) => Promise<unknown>;
};

/** Endpoint after plugin id is attached for mounting. */
export type ResolvedPluginEndpoint = PluginEndpoint & { pluginId: string };

/**
 * Environment passed to {@link DimahS3Plugin.init}.
 * Config is pre-merge (user config only) — use for feature-flag checks.
 */
export type PluginInitEnv = {
  /** User config before plugin hooks are merged — read-only. */
  config: Readonly<DimahS3Config>;
  /** Lookup another registered plugin by id. */
  getPlugin: (id: string) => DimahS3Plugin | undefined;
};

/**
 * Server plugin contract. Feature packages (e.g. `@dimah-s3/db`) return
 * these from factories like `db()` / `definePlugin()`.
 *
 * @typeParam Id — unique plugin id; becomes the key on `s3.context` and the
 *   flattened instance (`s3[id]`).
 * @typeParam TContext — exposed on `s3.context[id]` and `s3[id]` after
 *   `dimahS3()`.
 */
export type DimahS3Plugin<
  Id extends string = string,
  TContext extends Record<string, unknown> = Record<string, unknown>,
> = {
  /** Unique id — duplicate ids throw at init. */
  id: Id;
  /**
   * Other plugin ids that must be registered. Validated when `dimahS3()`
   * runs — missing deps throw with a clear message.
   * Merge order remains plugins-array order (not topological).
   */
  dependsOn?: readonly string[];
  /**
   * Runs once after the context map is built and before hooks are merged.
   * Synchronous so `dimahS3()` stays a sync factory — validate options /
   * required feature flags here.
   */
  init?: (env: PluginInitEnv) => void;
  /** Lifecycle / guard hooks merged ahead of user config hooks. */
  hooks?: DimahS3PluginHooks;
  /**
   * Extra HTTP routes mounted under `plugins/{id}/{path}` on the shared
   * handler. Use {@link createEndpoint} to build entries.
   */
  endpoints?: Record<string, PluginEndpoint>;
  /** Opaque context keyed by `id` on the dimahS3 instance. */
  context?: TContext;
};

export type AppliedPlugins<
  C extends Record<string, unknown> = Record<string, unknown>,
> = {
  /** Config with plugin hooks chained ahead of user hooks. */
  config: DimahS3Config;
  /** Plugin contexts keyed by plugin id. */
  context: C;
  getPlugin: (id: string) => DimahS3Plugin | undefined;
  /** Plugin HTTP endpoints ready to mount on the handler. */
  endpoints: ResolvedPluginEndpoint[];
};

/** Map plugin ids → their `context` types. */
export type PluginContextMap<P extends readonly DimahS3Plugin[]> = {
  [K in P[number] as K["id"]]: K extends DimahS3Plugin<string, infer Ctx>
    ? Ctx
    : never;
};

/** Keys reserved on the dimahS3 instance — plugins may not use these as ids. */
export const RESERVED_PLUGIN_IDS = [
  "handler",
  "api",
  "context",
  "getPlugin",
] as const;

export type ReservedPluginId = (typeof RESERVED_PLUGIN_IDS)[number];
