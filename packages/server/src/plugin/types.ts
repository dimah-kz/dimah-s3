import type { Endpoint } from "better-call";
import type {
  DeleteConfig,
  DownloadConfig,
  MultipartConfig,
  UploadConfig,
  DimahS3Config,
  ResolvedDimahS3Config,
} from "@/types/config";

/**
 * Hook fields a plugin may contribute. Scalars like `method` /
 * `object` / `acl` stay user-owned on the route `upload` policy.
 */
export type DimahS3PluginHooks = {
  guard?: DimahS3Config["guard"];
  upload?: Pick<
    UploadConfig,
    "guard" | "onPresigned" | "confirmGuard" | "onConfirmed"
  >;
  download?: Pick<DownloadConfig, "guard" | "onPresigned">;
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
 * @typeParam TEndpoints — better-call endpoints merged onto `s3.api`.
 */
export type DimahS3Plugin<
  Id extends string = string,
  TContext extends Record<string, unknown> = Record<string, unknown>,
  TEndpoints extends Record<string, Endpoint> = Record<string, Endpoint>,
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
   * Extra HTTP routes on the shared handler. Use {@link createS3Endpoint}.
   * Paths are absolute under `basePath` (e.g. `/db/objects`).
   */
  endpoints?: TEndpoints;
  /** Opaque context keyed by `id` on the dimahS3 instance. */
  context?: TContext;
};

export type AppliedPlugins<
  C extends Record<string, unknown> = Record<string, unknown>,
  E extends Record<string, Endpoint> = Record<string, Endpoint>,
> = {
  /** Config with plugin hooks chained ahead of user hooks. */
  config: ResolvedDimahS3Config;
  /** Plugin contexts keyed by plugin id. */
  context: C;
  getPlugin: (id: string) => DimahS3Plugin | undefined;
  /** Plugin HTTP endpoints merged onto `s3.api` and the router. */
  endpoints: E;
};

/** Map plugin ids → their `context` types. */
export type PluginContextMap<P extends readonly DimahS3Plugin[]> = {
  [K in P[number] as K["id"]]: K extends DimahS3Plugin<string, infer Ctx>
    ? Ctx
    : never;
};

/** Map plugin endpoint names → better-call endpoints. */
export type PluginEndpointMap<P extends readonly DimahS3Plugin[]> =
  P extends readonly []
    ? Record<string, never>
    : UnionToIntersection<
        P[number] extends { endpoints?: infer E }
          ? E extends Record<string, Endpoint>
            ? E
            : Record<string, never>
          : Record<string, never>
      >;

type UnionToIntersection<U> = (
  U extends unknown ? (k: U) => void : never
) extends (k: infer I) => void
  ? I
  : Record<string, never>;

/** Keys reserved on the dimahS3 instance — plugins may not use these as ids. */
export const RESERVED_PLUGIN_IDS = [
  "handler",
  "api",
  "context",
  "getPlugin",
  "$ERROR_CODES",
  "$Infer",
] as const;

export type ReservedPluginId = (typeof RESERVED_PLUGIN_IDS)[number];
