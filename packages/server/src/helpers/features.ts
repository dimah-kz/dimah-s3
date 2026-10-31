import {
  DEFAULT_INLINE_TYPES,
  normalizeObjectKey,
  S3_DEFAULT_EXPIRES_IN,
} from "@dimah-s3/core";
import { assertRouteName } from "@/route";
import type {
  DeleteConfig,
  DimahS3Config,
  DimahS3RouteConfig,
  DownloadConfig,
  FeatureToggle,
  MultipartConfig,
  UploadConfig,
} from "@/types/config";
import type {
  DisabledFeature,
  HookList,
  ResolvedDelete,
  ResolvedDownload,
  ResolvedMultipart,
  ResolvedRoute,
  ResolvedUpload,
} from "@/types/resolved";

const DEFAULT_CONFIRM_WINDOW = 3600;
const DEFAULT_MULTIPART_TICKET_EXPIRES_IN = 86_400;

/** Route hooks a plugin can add. Structurally a subset of `DimahS3PluginHooks`. */
export type RoutePluginHooks = {
  upload?: Pick<
    UploadConfig,
    "guard" | "onStart" | "confirmGuard" | "onConfirmed"
  > & { multipart?: Pick<MultipartConfig, "guard" | "onAbort"> };
  download?: Pick<DownloadConfig, "guard" | "onPresigned">;
  delete?: Pick<DeleteConfig, "guard" | "onDeleted">;
};

/** The parts of a plugin that route resolution reads. */
export type RoutePlugin = { id: string; hooks?: RoutePluginHooks };

export type ResolveRoutesOptions = {
  /** Instance `maxExpiresIn`. Caps every route TTL. */
  maxExpiresIn: number;
  /** Plugins in order. A route skips a plugin it sets to `false`. */
  plugins?: readonly RoutePlugin[];
};

/** Whether a resolved feature is on. Narrows to the enabled shape. */
export function isEnabled<T extends { enabled: boolean }>(
  feature: T,
): feature is T & { enabled: true } {
  return feature.enabled;
}

/**
 * Whether a feature toggle is on: `true` or an options object is on, and
 * `false` is off. `undefined` uses `defaultOn`. A resolved `{ enabled }`
 * object uses its flag.
 */
export function isFeatureOn<T extends object>(
  value: FeatureToggle<T> | { enabled: boolean } | undefined,
  defaultOn = false,
): boolean {
  if (value === undefined) return defaultOn;
  if (typeof value === "boolean") return value;
  if ("enabled" in value && typeof value.enabled === "boolean") {
    return value.enabled;
  }
  return true;
}

/**
 * One hook slot in run order: each plugin's hook in plugin order, then the
 * user hook.
 */
export function hookList<P extends { id: string }, H>(
  plugins: readonly P[],
  pick: (plugin: P) => H | undefined,
  user: H | undefined,
): HookList<H> {
  const list: { plugin?: string; hook: H }[] = [];
  for (const plugin of plugins) {
    const hook = pick(plugin);
    if (hook !== undefined) list.push({ plugin: plugin.id, hook });
  }
  if (user !== undefined) list.push({ hook: user });
  return list;
}

/**
 * Validates every route, applies the documented defaults, and builds each
 * hook list from the plugins and the user config. Throws on a config
 * error, so `dimahS3()` fails at startup.
 */
export function resolveRoutes(
  config: Pick<DimahS3Config, "client" | "bucket" | "routes">,
  options: ResolveRoutesOptions,
): Record<string, ResolvedRoute> {
  const entries = Object.entries(config.routes);
  if (entries.length === 0) {
    throw new Error("dimahS3: at least one route is required.");
  }
  const routes: Record<string, ResolvedRoute> = {};
  for (const [name, route] of entries) {
    routes[name] = resolveRoute(name, route, config, options);
  }
  assertDistinctKeyPrefixes(routes);
  return routes;
}

type RouteEnv = {
  name: string;
  maxExpiresIn: number;
  plugins: readonly RoutePlugin[];
};

function resolveRoute(
  name: string,
  route: DimahS3RouteConfig,
  instance: Pick<DimahS3Config, "client" | "bucket">,
  options: ResolveRoutesOptions,
): ResolvedRoute {
  assertRouteName(name);
  const client = route.client ?? instance.client;
  const bucket = route.bucket ?? instance.bucket;
  if (!client) {
    throw routeError(name, "set client on the route or on dimahS3().");
  }
  if (!bucket) {
    throw routeError(name, "set bucket on the route or on dimahS3().");
  }

  const env: RouteEnv = {
    name,
    maxExpiresIn: options.maxExpiresIn,
    plugins: (options.plugins ?? []).filter(
      (plugin) => route.plugins?.[plugin.id] !== false,
    ),
  };
  const upload = resolveUpload(route.upload, env);
  const download = resolveDownload(route.download, env);
  const deleteFeature = resolveDelete(route.delete, env);
  if (!upload.enabled && !download.enabled && !deleteFeature.enabled) {
    throw routeError(name, "enable upload, download, or delete.");
  }

  return {
    name,
    client,
    bucket,
    keyPrefix: resolveKeyPrefix(name, route.keyPrefix),
    plugins: route.plugins ?? {},
    // Plugins add instance guards, not route guards.
    guard: route.guard ? [{ hook: route.guard }] : [],
    upload,
    download,
    delete: deleteFeature,
  };
}

function resolveUpload(
  toggle: FeatureToggle<UploadConfig> | undefined,
  env: RouteEnv,
): ResolvedRoute["upload"] {
  if (!isFeatureOn(toggle)) {
    return { enabled: false, multipart: { enabled: false } };
  }
  const upload: UploadConfig = toggle === true || !toggle ? {} : toggle;
  if (upload.verifyContent && upload.checksum === false) {
    throw routeError(
      env.name,
      "upload.checksum cannot be false while upload.verifyContent is on.",
    );
  }
  const hooks = (plugin: RoutePlugin) => plugin.hooks?.upload;
  const resolved: ResolvedUpload = {
    enabled: true,
    fileTypes: upload.fileTypes,
    maxFileSize: optionalPositiveInteger(
      env,
      "upload.maxFileSize",
      upload.maxFileSize,
    ),
    object: upload.object,
    acl: upload.acl ?? "private",
    method: upload.method ?? "PUT",
    expiresIn: Math.min(
      positiveInteger(
        env,
        "upload.expiresIn",
        upload.expiresIn,
        S3_DEFAULT_EXPIRES_IN,
      ),
      env.maxExpiresIn,
    ),
    confirmWindow: positiveInteger(
      env,
      "upload.confirmWindow",
      upload.confirmWindow,
      DEFAULT_CONFIRM_WINDOW,
    ),
    checksum: upload.checksum === true || upload.verifyContent === true,
    verifyContent: upload.verifyContent === true,
    multipart: resolveMultipart(upload.multipart, env),
    guard: hookList(env.plugins, (p) => hooks(p)?.guard, upload.guard),
    onStart: hookList(env.plugins, (p) => hooks(p)?.onStart, upload.onStart),
    confirmGuard: hookList(
      env.plugins,
      (p) => hooks(p)?.confirmGuard,
      upload.confirmGuard,
    ),
    onConfirmed: hookList(
      env.plugins,
      (p) => hooks(p)?.onConfirmed,
      upload.onConfirmed,
    ),
  };
  return resolved;
}

function resolveMultipart(
  toggle: FeatureToggle<MultipartConfig> | undefined,
  env: RouteEnv,
): ResolvedMultipart | DisabledFeature {
  if (!isFeatureOn(toggle)) return { enabled: false };
  const multipart: MultipartConfig = toggle === true || !toggle ? {} : toggle;
  const hooks = (plugin: RoutePlugin) => plugin.hooks?.upload?.multipart;
  return {
    enabled: true,
    partSize: optionalPositiveInteger(
      env,
      "upload.multipart.partSize",
      multipart.partSize,
    ),
    ticketExpiresIn: positiveInteger(
      env,
      "upload.multipart.ticketExpiresIn",
      multipart.ticketExpiresIn,
      DEFAULT_MULTIPART_TICKET_EXPIRES_IN,
    ),
    guard: hookList(env.plugins, (p) => hooks(p)?.guard, multipart.guard),
    onAbort: hookList(env.plugins, (p) => hooks(p)?.onAbort, multipart.onAbort),
  };
}

function resolveDownload(
  toggle: FeatureToggle<DownloadConfig> | undefined,
  env: RouteEnv,
): ResolvedDownload | DisabledFeature {
  if (!isFeatureOn(toggle)) return { enabled: false };
  const download: DownloadConfig = toggle === true || !toggle ? {} : toggle;
  const mode = download.mode ?? "presign";
  const hooks = (plugin: RoutePlugin) => plugin.hooks?.download;
  return {
    enabled: true,
    maxExpiresIn: Math.min(
      positiveInteger(
        env,
        "download.maxExpiresIn",
        download.maxExpiresIn,
        S3_DEFAULT_EXPIRES_IN,
      ),
      env.maxExpiresIn,
    ),
    disposition: download.disposition ?? "attachment",
    inlineTypes:
      download.inlineTypes ??
      (mode === "proxy"
        ? DEFAULT_INLINE_TYPES.filter((type) => type !== "application/pdf")
        : DEFAULT_INLINE_TYPES),
    mode,
    resolve: download.resolve,
    guard: hookList(env.plugins, (p) => hooks(p)?.guard, download.guard),
    onPresigned: hookList(
      env.plugins,
      (p) => hooks(p)?.onPresigned,
      download.onPresigned,
    ),
  };
}

function resolveDelete(
  toggle: FeatureToggle<DeleteConfig> | undefined,
  env: RouteEnv,
): ResolvedDelete | DisabledFeature {
  if (!isFeatureOn(toggle)) return { enabled: false };
  const config: DeleteConfig = toggle === true || !toggle ? {} : toggle;
  const hooks = (plugin: RoutePlugin) => plugin.hooks?.delete;
  return {
    enabled: true,
    guard: hookList(env.plugins, (p) => hooks(p)?.guard, config.guard),
    onDeleted: hookList(
      env.plugins,
      (p) => hooks(p)?.onDeleted,
      config.onDeleted,
    ),
  };
}

function routeError(name: string, message: string): Error {
  return new Error(`dimahS3 route "${name}": ${message}`);
}

/** A positive safe integer, or `fallback` when unset. */
function positiveInteger(
  env: RouteEnv,
  field: string,
  value: number | undefined,
  fallback: number,
): number {
  return optionalPositiveInteger(env, field, value) ?? fallback;
}

/** A positive safe integer, or `undefined` when unset. Fails at startup. */
function optionalPositiveInteger(
  env: RouteEnv,
  field: string,
  value: number | undefined,
): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw routeError(env.name, `${field} must be a positive integer.`);
  }
  return value;
}

function resolveKeyPrefix(
  name: string,
  value: DimahS3RouteConfig["keyPrefix"],
): string | false {
  if (value === false) return false;
  const normalized = normalizeObjectKey(value ?? name);
  if (!normalized) {
    throw routeError(name, "keyPrefix is not a valid object-key prefix.");
  }
  return normalized;
}

function prefixesOverlap(a: string, b: string): boolean {
  return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}

/** Nested or identical `keyPrefix` values would let one route reach another's keys. */
function assertDistinctKeyPrefixes(
  routes: Record<string, ResolvedRoute>,
): void {
  const named = Object.values(routes).filter(
    (route): route is ResolvedRoute & { keyPrefix: string } =>
      route.keyPrefix !== false,
  );
  for (let i = 0; i < named.length; i++) {
    for (let j = i + 1; j < named.length; j++) {
      const a = named[i];
      const b = named[j];
      if (prefixesOverlap(a.keyPrefix, b.keyPrefix)) {
        throw new Error(
          `dimahS3: routes "${a.name}" and "${b.name}" have overlapping keyPrefix values ("${a.keyPrefix}" and "${b.keyPrefix}").`,
        );
      }
    }
  }
}
