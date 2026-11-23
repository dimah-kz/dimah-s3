import { runGuards } from "@/helpers/hooks";
import { getRoute } from "@/helpers/open-target";
import { runOperation } from "@/operations/run-operation";
import type { DimahS3Config, S3ServerCallOptions } from "@/types/config";
import type { GuardContext, RouteGuardContext } from "@/types/hook-contexts";
import type { ResolvedConfig, ResolvedRoute } from "@/types/resolved";
import type {
  DimahS3Plugin,
  PluginInitEnv,
  PluginOperationTarget,
  PluginRoute,
  PluginRouteOptions,
  PluginRunOperation,
} from "./types";

/** The env one plugin's `init` receives. */
export function createPluginEnv<Id extends string>(
  pluginId: Id,
  config: Readonly<DimahS3Config>,
  resolved: ResolvedConfig,
  getPlugin: (id: string) => DimahS3Plugin | undefined,
): PluginInitEnv<Id> {
  // Null prototype: `routes[name]` never finds `toString` or `__proto__`.
  const routes: Record<string, PluginRoute<Id>> = Object.create(null);
  for (const route of Object.values(resolved.routes)) {
    routes[route.name] = pluginRoute<Id>(pluginId, route);
  }
  Object.freeze(routes);

  const run = (<T>(
    target: PluginOperationTarget,
    options: S3ServerCallOptions | undefined,
    callback: (
      context: GuardContext & Partial<RouteGuardContext>,
    ) => Promise<T>,
  ) =>
    runPluginOperation(
      resolved,
      pluginId,
      target,
      options ?? {},
      callback,
    )) as PluginRunOperation;

  return {
    config,
    routes,
    getPlugin,
    routeOptions: <T extends object = PluginRouteOptions<Id>>(route: string) =>
      routes[route]?.options as T | false | undefined,
    logger: resolved.logger,
    runOperation: run,
  };
}

/** The read-only view of a resolved route that plugins get. */
function pluginRoute<Id extends string>(
  pluginId: string,
  route: ResolvedRoute,
): PluginRoute<Id> {
  const options = Object.hasOwn(route.plugins, pluginId)
    ? route.plugins[pluginId]
    : undefined;
  const { upload, download } = route;
  return Object.freeze({
    name: route.name,
    client: route.client,
    bucket: route.bucket,
    keyPrefix: route.keyPrefix,
    options: options as PluginRouteOptions<Id> | false | undefined,
    upload: Object.freeze(
      upload.enabled
        ? {
            enabled: true as const,
            ...(upload.fileTypes !== undefined && {
              fileTypes: Object.freeze([...upload.fileTypes]),
            }),
            ...(upload.maxFileSize !== undefined && {
              maxFileSize: upload.maxFileSize,
            }),
            multipart: upload.multipart.enabled,
          }
        : { enabled: false as const },
    ),
    download: Object.freeze(
      download.enabled
        ? { enabled: true as const, mode: download.mode }
        : { enabled: false as const },
    ),
    delete: Object.freeze({ enabled: route.delete.enabled }),
  });
}

/**
 * One in-process plugin call: the instance guards as operation `"plugin"`,
 * then the route guard when the call names a route.
 */
async function runPluginOperation<T>(
  resolved: ResolvedConfig,
  pluginId: string,
  target: PluginOperationTarget,
  options: S3ServerCallOptions,
  run: (context: GuardContext & Partial<RouteGuardContext>) => Promise<T>,
): Promise<T> {
  const action: unknown = target.action;
  // A plugin bug, not a caller error: fail before any guard runs.
  if (typeof action !== "string" || action === "") {
    throw new TypeError(
      `dimahS3: plugin "${pluginId}" called runOperation without an action.`,
    );
  }
  return runOperation(
    resolved,
    { id: pluginId, action },
    options,
    async (context) => {
      if (target.route === undefined) return run(context);
      const route = getRoute(resolved, target.route);
      const routeContext: RouteGuardContext = { ...context, route: route.name };
      await runGuards(route.guard, routeContext);
      return run(routeContext);
    },
  );
}
