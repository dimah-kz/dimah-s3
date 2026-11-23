import {
  ROUTE_NAME_PATTERN,
  S3_API_ROUTES,
  S3_ERROR_CODES,
  type S3ErrorCatalog,
  type S3ErrorCodeEntry,
} from "@dimah-s3/core";
import type { Endpoint } from "better-call";
import { bindPluginCall } from "@/api/plugin-call";
import type { DimahS3Config } from "@/types/config";
import type { ResolvedConfig } from "@/types/resolved";
import { createPluginEnv } from "./plugin-env";
import type { AppliedPlugins, DimahS3Plugin, PluginContextMap } from "./types";

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

/**
 * First path segments of the core endpoints (`presign`, `file`, …). A
 * plugin's endpoints sit under `/{id}`, so these ids are taken.
 */
const CORE_PATH_SEGMENTS: ReadonlySet<string> = new Set(
  Object.values(S3_API_ROUTES).map((path) => path.split("/")[1]),
);

/**
 * Checks the plugins, builds the context map, collects the endpoints and
 * error codes, and runs each `init` in plugin order. Throws on a config
 * error, so `dimahS3()` fails at startup.
 *
 * Plugin hooks are not merged here: route resolution builds each hook list
 * with plugin hooks first, then the user hook.
 */
export function applyPlugins<
  const P extends readonly DimahS3Plugin[],
  C = PluginContextMap<P>,
>(
  config: DimahS3Config & { plugins?: P },
  resolved: ResolvedConfig,
): AppliedPlugins<C> {
  const plugins: readonly DimahS3Plugin[] = config.plugins ?? [];
  const byId = registerPlugins(plugins);
  assertDependencies(plugins, byId);
  const endpoints = collectEndpoints(plugins);
  const errorCodes = collectErrorCodes(plugins);

  const context: Record<string, unknown> = {};
  for (const plugin of plugins) {
    if (plugin.context !== undefined) context[plugin.id] = plugin.context;
  }

  const getPlugin = (id: string) => byId.get(id);
  for (const plugin of plugins) {
    const result: unknown = plugin.init?.(
      createPluginEnv(plugin.id, config, resolved, getPlugin),
    );
    if (isPromiseLike(result)) {
      // Never leave its rejection unhandled; the throw below reports it.
      void Promise.resolve(result).catch(() => undefined);
      throw new Error(
        `dimahS3: plugin "${plugin.id}" init returned a promise. init runs inside dimahS3(), so it must be synchronous; start async work lazily, in a hook or a context method.`,
      );
    }
  }

  return { context: context as C, getPlugin, endpoints, errorCodes };
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { then?: unknown }).then === "function"
  );
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
    if (typeof plugin.id !== "string" || !ROUTE_NAME_PATTERN.test(plugin.id)) {
      throw new Error(
        `dimahS3: plugin id "${String(plugin.id)}" is invalid. Use a letter followed by up to 63 letters, digits, underscores, or hyphens.`,
      );
    }
    if (CORE_PATH_SEGMENTS.has(plugin.id)) {
      throw new Error(
        `dimahS3: plugin id "${plugin.id}" is a core endpoint path. Choose a different id.`,
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
 * Plugin endpoints keyed by name, each bound to its plugin call so guards
 * see `plugin: { id, action }`. A path sits under `/{id}`, so plugins never
 * collide with each other or with a core endpoint. A name may not reuse a
 * core or another plugin's name, and each method and path pair is unique.
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
      const namespace = `/${plugin.id}`;
      if (
        typeof path !== "string" ||
        (path !== namespace && !path.startsWith(`${namespace}/`))
      ) {
        throw new Error(
          `${label} needs a path under "${namespace}/", such as pluginPath("${plugin.id}", "${name}").`,
        );
      }
      const { method } = endpoint.options;
      for (const verb of Array.isArray(method) ? method : [method]) {
        const route = `${verb} ${path}`;
        if (routes.has(route)) {
          throw new Error(`${label} duplicates ${route}.`);
        }
        routes.add(route);
      }
      endpoints[name] = bindPluginCall(endpoint, {
        id: plugin.id,
        action: name,
      });
    }
  }
  return endpoints;
}

/**
 * The core catalog with each plugin's `$ERROR_CODES` added. A code that is
 * already there, or an entry not built with `defineErrorCodes`, throws.
 * Without plugin codes it is the core catalog itself.
 */
function collectErrorCodes(plugins: readonly DimahS3Plugin[]): S3ErrorCatalog {
  if (!plugins.some((plugin) => plugin.$ERROR_CODES !== undefined)) {
    return S3_ERROR_CODES;
  }
  const codes: Record<string, S3ErrorCodeEntry> = { ...S3_ERROR_CODES };
  const owners = new Map<string, string>();
  for (const plugin of plugins) {
    const catalog: S3ErrorCatalog = plugin.$ERROR_CODES ?? {};
    for (const [code, entry] of Object.entries(catalog)) {
      const label = `dimahS3: plugin "${plugin.id}" error code "${code}"`;
      if (entry.code !== code) {
        throw new Error(`${label} must be built with defineErrorCodes.`);
      }
      if (Object.hasOwn(codes, code)) {
        const owner = owners.get(code);
        throw new Error(
          `${label} is already defined by ${owner ? `plugin "${owner}"` : "the core catalog"}.`,
        );
      }
      codes[code] = entry;
      owners.set(code, plugin.id);
    }
  }
  return codes;
}
