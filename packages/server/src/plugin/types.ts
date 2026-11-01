import type { Endpoint } from "better-call";
import type {
  DeleteConfig,
  DimahS3Config,
  DimahS3Logger,
  DownloadConfig,
  MultipartConfig,
  TicketSubject,
  UploadConfig,
} from "@/types/config";
import type { GuardContext } from "@/types/hook-contexts";
import type { Guard } from "@/types/locals";

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
    "guard" | "onStart" | "confirmGuard" | "onConfirmed"
  > & { multipart?: Pick<MultipartConfig, "guard" | "onAbort"> };
  download?: Pick<DownloadConfig, "guard" | "onPresigned">;
  delete?: Pick<DeleteConfig, "guard" | "onDeleted">;
};

/** What {@link DimahS3Plugin.init} receives. */
export type PluginInitEnv = {
  /** The user config. The routes are already validated. */
  config: Readonly<DimahS3Config>;
  /** Looks up a registered plugin by id. */
  getPlugin: (id: string) => DimahS3Plugin | undefined;
  /**
   * This plugin's options for a route (`routes[route].plugins[id]`).
   * `false` means the route turned the plugin off, and `undefined` means the
   * route sets nothing or does not exist.
   */
  routeOptions: <T extends object>(route: string) => T | false | undefined;
  /** The instance logger. */
  logger: DimahS3Logger;
};

/**
 * A server plugin, such as `db()` from `@dimah-s3/db`. Build one with
 * `definePlugin` so its `id` and `context` types are kept.
 *
 * @typeParam Id - The plugin id. It keys `s3.context` and the instance
 *   (`s3[id]`).
 * @typeParam TContext - The value on `s3.context[id]` and `s3[id]`.
 */
export type DimahS3Plugin<
  Id extends string = string,
  TContext extends Record<string, unknown> = Record<string, unknown>,
> = {
  /** Unique id. A duplicate or an instance key such as `api` throws. */
  id: Id;
  /**
   * Ids of plugins that must be registered too. A missing or circular
   * dependency throws at `dimahS3()`. Hooks still run in plugin order.
   */
  dependsOn?: readonly string[];
  /**
   * Runs once at `dimahS3()`, in plugin order, after the routes are
   * validated. Throw here to reject the config. It must be synchronous:
   * returning a promise throws.
   */
  init?: (env: PluginInitEnv) => void;
  hooks?: DimahS3PluginHooks;
  /**
   * HTTP endpoints mounted on the handler under `basePath`. Build them with
   * `createS3Endpoint`. They are not added to `s3.api`.
   */
  endpoints?: Record<string, Endpoint>;
  /** Exposed on `s3.context[id]` and `s3[id]`. */
  context?: TContext;
};

/** Plugin ids mapped to their `context` types. */
export type PluginContextMap<P extends readonly DimahS3Plugin[]> = {
  [K in P[number] as K["id"]]: K extends DimahS3Plugin<string, infer Ctx>
    ? Ctx
    : never;
};

/** What `applyPlugins` returns to `dimahS3()`. */
export type AppliedPlugins<C> = {
  /** Plugin contexts keyed by plugin id. */
  context: C;
  getPlugin: (id: string) => DimahS3Plugin | undefined;
  /** Every plugin endpoint, keyed by name, to mount beside the core ones. */
  endpoints: Record<string, Endpoint>;
};
