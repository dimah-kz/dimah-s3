import { S3_API_ROUTES } from "@dimah-s3/core";
import type { Endpoint } from "better-call";
import { CORE_ENDPOINT_NAMES } from "@/api/routes";
import { normalizeRoutes } from "@/helpers/features";
import type {
  DimahS3Config,
  ResolvedDimahS3Config,
  ResolvedRoutePolicy,
} from "@/types";
import { chainHooks } from "./chain-hooks";
import { FEATURE_HOOK_KEYS, MULTIPART_HOOK_KEYS } from "./hook-registry";
import {
  RESERVED_PLUGIN_IDS,
  type AppliedPlugins,
  type DimahS3Plugin,
  type PluginContextMap,
} from "./types";

type HookFn = ((context: never) => Promise<void> | void) | undefined;
type HookBag = Record<string, HookFn>;

function mergeHookField(
  pluginHooks: HookFn[],
  userHook: HookFn,
): HookFn | undefined {
  const present = [...pluginHooks, userHook].filter(
    (h): h is NonNullable<HookFn> => h != null,
  );
  if (present.length === 0) return undefined;
  if (present.length === 1) return present[0];
  return chainHooks(...present) as HookFn;
}

function mergeHooks<T extends object>(
  keys: readonly string[],
  plugins: readonly DimahS3Plugin[],
  userFeature: T,
  pick: (plugin: DimahS3Plugin) => HookBag | undefined,
): T {
  const merged: HookBag = { ...(userFeature as HookBag) };
  for (const key of keys) {
    const next = mergeHookField(
      plugins.map((plugin) => pick(plugin)?.[key]),
      (userFeature as HookBag)[key],
    );
    if (next !== undefined) merged[key] = next;
  }
  return merged as T;
}

function applyHooksToRoute(
  route: ResolvedRoutePolicy,
  plugins: readonly DimahS3Plugin[],
): ResolvedRoutePolicy {
  const active = plugins.filter((p) => !route.skippedPluginIds.has(p.id));

  const upload = route.upload.enabled
    ? {
        ...mergeHooks(
          FEATURE_HOOK_KEYS.upload,
          active,
          route.upload,
          (p) => p.hooks?.upload as HookBag | undefined,
        ),
        multipart: route.upload.multipart.enabled
          ? mergeHooks(
              MULTIPART_HOOK_KEYS,
              active,
              route.upload.multipart,
              (p) => p.hooks?.upload?.multipart as HookBag | undefined,
            )
          : route.upload.multipart,
      }
    : route.upload;

  return {
    ...route,
    upload,
    download: route.download.enabled
      ? mergeHooks(
          FEATURE_HOOK_KEYS.download,
          active,
          route.download,
          (p) => p.hooks?.download as HookBag | undefined,
        )
      : route.download,
    delete: route.delete.enabled
      ? mergeHooks(
          FEATURE_HOOK_KEYS.delete,
          active,
          route.delete,
          (p) => p.hooks?.delete as HookBag | undefined,
        )
      : route.delete,
  };
}

/**
 * Validate plugins, build context map, collect endpoints, run `init`,
 * and merge hooks into each route.
 * Plugin hooks run in array order; user hooks run last.
 * Hooks are not merged onto a feature that is off for that route.
 */
export function applyPlugins<
  const P extends readonly DimahS3Plugin[],
  C extends Record<string, unknown> = PluginContextMap<P>,
>(config: DimahS3Config & { plugins?: P }): AppliedPlugins<C> {
  const plugins = config.plugins ?? [];
  const seen = new Set<string>();
  const byId = new Map<string, DimahS3Plugin>();
  const context = {} as C;
  const getPlugin = (id: string) => byId.get(id);

  for (const plugin of plugins) {
    if ((RESERVED_PLUGIN_IDS as readonly string[]).includes(plugin.id)) {
      throw new Error(
        `Plugin id "${plugin.id}" is reserved on the dimahS3 instance. Choose a different id.`,
      );
    }
    if (seen.has(plugin.id)) {
      throw new Error(
        `Duplicate dimah-s3 plugin id "${plugin.id}". Each plugin id must be unique.`,
      );
    }
    seen.add(plugin.id);
    byId.set(plugin.id, plugin);
  }

  for (const plugin of plugins) {
    for (const dep of plugin.dependsOn ?? []) {
      if (!seen.has(dep)) {
        throw new Error(
          `Plugin "${plugin.id}" depends on "${dep}", which is not registered.`,
        );
      }
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  function visit(id: string, stack: string[]) {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      throw new Error(
        `Circular plugin dependency detected: ${[...stack, id].join(" -> ")}.`,
      );
    }
    visiting.add(id);
    const plugin = byId.get(id);
    for (const dep of plugin?.dependsOn ?? []) {
      visit(dep, [...stack, id]);
    }
    visiting.delete(id);
    visited.add(id);
  }
  for (const plugin of plugins) {
    visit(plugin.id, []);
  }

  for (const plugin of plugins) {
    if (plugin.context !== undefined) {
      (context as Record<string, unknown>)[plugin.id] = plugin.context;
    }
  }

  const reservedRoutePaths = new Set<string>(Object.values(S3_API_ROUTES));
  const reservedNames = new Set<string>([...CORE_ENDPOINT_NAMES, "multipart"]);
  const seenEndpointKeys = new Set<string>();
  const endpoints: Record<string, Endpoint> = {};

  for (const plugin of plugins) {
    for (const [name, endpoint] of Object.entries(plugin.endpoints ?? {})) {
      if (reservedNames.has(name) || name in endpoints) {
        throw new Error(
          `Plugin "${plugin.id}" endpoint "${name}" collides with an existing endpoint.`,
        );
      }
      const path = endpoint.path;
      if (typeof path !== "string" || !path.startsWith("/")) {
        throw new Error(
          `Plugin "${plugin.id}" endpoint "${name}" path must start with "/".`,
        );
      }
      if (reservedRoutePaths.has(path)) {
        throw new Error(
          `Plugin "${plugin.id}" endpoint "${name}" collides with a core route.`,
        );
      }
      const methods = Array.isArray(endpoint.options.method)
        ? endpoint.options.method
        : [endpoint.options.method];
      for (const method of methods) {
        const routeKey = `${method} ${path}`;
        if (seenEndpointKeys.has(routeKey)) {
          throw new Error(`Duplicate plugin endpoint ${routeKey}.`);
        }
        seenEndpointKeys.add(routeKey);
      }
      endpoints[name] = endpoint;
    }
  }

  const { plugins: _omit, ...rest } = config;

  for (const plugin of plugins) {
    plugin.init?.({ config: rest, getPlugin });
  }

  const normalized = normalizeRoutes(rest);
  const routes: Record<string, ResolvedRoutePolicy> = {};
  for (const [name, route] of Object.entries(normalized)) {
    routes[name] = applyHooksToRoute(route, plugins);
  }

  const guard = mergeHookField(
    plugins.map((p) => p.hooks?.guard as HookFn),
    rest.guard as HookFn,
  ) as ResolvedDimahS3Config["guard"];

  const merged: ResolvedDimahS3Config = {
    ...rest,
    routes,
    ...(guard !== undefined ? { guard } : {}),
  };

  return {
    config: merged,
    context,
    getPlugin,
    endpoints,
  };
}
