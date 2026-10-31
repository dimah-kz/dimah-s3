import { S3_API_ROUTES } from "@dimah-s3/core";
import type { Endpoint } from "better-call";
import type { DimahS3Config, DimahS3Logger } from "@/types/config";
import type {
  AppliedPlugins,
  DimahS3Plugin,
  PluginContextMap,
  PluginInitEnv,
} from "./types";

/** Keys of the `dimahS3()` instance. Plugin contexts are spread beside them. */
const RESERVED_PLUGIN_IDS: ReadonlySet<string> = new Set([
  "handler",
  "api",
  "put",
  "context",
  "getPlugin",
  "$ERROR_CODES",
  "$Infer",
]);

/** Core endpoint names. The router mounts plugin endpoints beside them. */
const CORE_ENDPOINT_NAMES: ReadonlySet<string> = new Set(
  Object.keys(S3_API_ROUTES),
);

const CORE_ENDPOINT_PATHS: ReadonlySet<string> = new Set(
  Object.values(S3_API_ROUTES),
);

/**
 * Checks the plugins, builds the context map, collects the endpoints, and
 * runs each `init` in plugin order. Throws on a config error, so
 * `dimahS3()` fails at startup.
 *
 * Plugin hooks are not merged here: route resolution builds each hook list
 * with plugin hooks first, then the user hook.
 */
export function applyPlugins<
  const P extends readonly DimahS3Plugin[],
  C = PluginContextMap<P>,
>(
  config: DimahS3Config & { plugins?: P },
  logger: DimahS3Logger,
): AppliedPlugins<C> {
  const plugins: readonly DimahS3Plugin[] = config.plugins ?? [];
  const byId = registerPlugins(plugins);
  assertDependencies(plugins, byId);
  const endpoints = collectEndpoints(plugins);

  const context: Record<string, unknown> = {};
  for (const plugin of plugins) {
    if (plugin.context !== undefined) context[plugin.id] = plugin.context;
  }

  const getPlugin = (id: string) => byId.get(id);
  for (const plugin of plugins) {
    plugin.init?.(initEnv(plugin.id, config, getPlugin, logger));
  }

  return { context: context as C, getPlugin, endpoints };
}

function registerPlugins(
  plugins: readonly DimahS3Plugin[],
): Map<string, DimahS3Plugin> {
  const byId = new Map<string, DimahS3Plugin>();
  for (const plugin of plugins) {
    if (RESERVED_PLUGIN_IDS.has(plugin.id)) {
      throw new Error(
        `dimahS3: plugin id "${plugin.id}" is reserved on the instance. Choose a different id.`,
      );
    }
    if (byId.has(plugin.id)) {
      throw new Error(
        `dimahS3: duplicate plugin id "${plugin.id}". Each plugin id must be unique.`,
      );
    }
    byId.set(plugin.id, plugin);
  }
  return byId;
}

/** Every `dependsOn` id is registered, and the graph has no cycle. */
function assertDependencies(
  plugins: readonly DimahS3Plugin[],
  byId: ReadonlyMap<string, DimahS3Plugin>,
): void {
  for (const plugin of plugins) {
    for (const dependency of plugin.dependsOn ?? []) {
      if (!byId.has(dependency)) {
        throw new Error(
          `dimahS3: plugin "${plugin.id}" depends on "${dependency}", which is not registered.`,
        );
      }
    }
  }

  const done = new Set<string>();
  const visit = (id: string, path: readonly string[]): void => {
    if (done.has(id)) return;
    if (path.includes(id)) {
      throw new Error(
        `dimahS3: circular plugin dependency ${[...path, id].join(" -> ")}.`,
      );
    }
    for (const dependency of byId.get(id)?.dependsOn ?? []) {
      visit(dependency, [...path, id]);
    }
    done.add(id);
  };
  for (const plugin of plugins) visit(plugin.id, []);
}

/**
 * Plugin endpoints keyed by name. A name or path may not collide with a
 * core endpoint, and each name and each method and path pair is unique.
 */
function collectEndpoints(
  plugins: readonly DimahS3Plugin[],
): Record<string, Endpoint> {
  const endpoints: Record<string, Endpoint> = {};
  const routes = new Set<string>();

  for (const plugin of plugins) {
    for (const [name, endpoint] of Object.entries(plugin.endpoints ?? {})) {
      const label = `dimahS3: plugin "${plugin.id}" endpoint "${name}"`;
      if (CORE_ENDPOINT_NAMES.has(name) || Object.hasOwn(endpoints, name)) {
        throw new Error(`${label} reuses an existing endpoint name.`);
      }
      const { path } = endpoint;
      if (typeof path !== "string" || !path.startsWith("/")) {
        throw new Error(`${label} needs a path that starts with "/".`);
      }
      if (CORE_ENDPOINT_PATHS.has(path)) {
        throw new Error(`${label} uses the core path ${path}.`);
      }
      const { method } = endpoint.options;
      for (const verb of Array.isArray(method) ? method : [method]) {
        const route = `${verb} ${path}`;
        if (routes.has(route)) {
          throw new Error(`${label} duplicates ${route}.`);
        }
        routes.add(route);
      }
      endpoints[name] = endpoint;
    }
  }
  return endpoints;
}

function initEnv(
  pluginId: string,
  config: DimahS3Config,
  getPlugin: PluginInitEnv["getPlugin"],
  logger: DimahS3Logger,
): PluginInitEnv {
  return {
    config,
    getPlugin,
    routeOptions: <T extends object>(route: string) => {
      if (!Object.hasOwn(config.routes, route)) return undefined;
      const options = config.routes[route].plugins;
      if (!options || !Object.hasOwn(options, pluginId)) return undefined;
      return options[pluginId] as T | false | undefined;
    },
    logger,
  };
}
