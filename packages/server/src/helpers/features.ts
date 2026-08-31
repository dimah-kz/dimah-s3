import type {
  DeleteConfig,
  DimahS3Config,
  DimahS3RouteConfig,
  DownloadConfig,
  EnabledFeature,
  FeatureToggle,
  MultipartConfig,
  ResolvedFeature,
  ResolvedRoute,
  ResolvedUploadConfig,
  UploadConfig,
} from "@/types";
import { normalizeObjectKey } from "@/helpers/resolve-target";
import { assertRouteName } from "@/route";

export function isEnabled<T extends { enabled: boolean }>(
  feature: T,
): feature is T & { enabled: true } {
  return feature.enabled;
}

function resolveKeyPrefix(
  name: string,
  value: DimahS3RouteConfig["keyPrefix"],
): string | false {
  if (value === false) return false;
  const normalized = normalizeObjectKey(value ?? name);
  if (!normalized) {
    throw new Error(
      `dimahS3 route "${name}": keyPrefix is not a valid object-key prefix.`,
    );
  }
  return normalized;
}

/**
 * `true` / options → on; `false` → off.
 * `undefined` uses {@link defaultOn} (false unless passed).
 * Resolved `{ enabled }` objects (after `normalizeFeature`) use that flag.
 */
export function isFeatureOn<T extends object>(
  value: FeatureToggle<T> | ResolvedFeature<T> | undefined,
  defaultOn = false,
): boolean {
  if (value === false) return false;
  if (value === undefined) return defaultOn;
  if (value === true) return true;
  if ("enabled" in value && typeof value.enabled === "boolean") {
    return value.enabled;
  }
  return true;
}

/** `true` / options → enabled; omit / `false` → disabled. */
export function normalizeFeature<T extends object>(
  value: FeatureToggle<T> | undefined,
  defaultOn = false,
): ResolvedFeature<T> {
  if (value === false) return { enabled: false };
  if (value === undefined) {
    if (!defaultOn) return { enabled: false };
    return { enabled: true } as EnabledFeature<T>;
  }
  if (value === true) return { enabled: true } as EnabledFeature<T>;
  return { ...value, enabled: true };
}

function skippedPluginIds(plugins: DimahS3RouteConfig["plugins"]): Set<string> {
  const ids = new Set<string>();
  if (!plugins) return ids;
  for (const [id, enabled] of Object.entries(plugins)) {
    if (enabled === false) ids.add(id);
  }
  return ids;
}

function splitUpload(upload: DimahS3RouteConfig["upload"]): {
  upload: FeatureToggle<Omit<UploadConfig, "multipart">> | undefined;
  multipart: FeatureToggle<MultipartConfig> | undefined;
} {
  if (upload === undefined || typeof upload === "boolean") {
    return { upload, multipart: undefined };
  }
  const { multipart, ...rest } = upload;
  return { upload: rest, multipart };
}

export function normalizeRoute(
  name: string,
  route: DimahS3RouteConfig,
  instance: Pick<DimahS3Config, "client" | "bucket">,
): ResolvedRoute {
  assertRouteName(name);

  const client = route.client ?? instance.client;
  const bucket = route.bucket ?? instance.bucket;
  if (!client) {
    throw new Error(
      `dimahS3 route "${name}": set client on the route or on dimahS3().`,
    );
  }
  if (!bucket) {
    throw new Error(
      `dimahS3 route "${name}": set bucket on the route or on dimahS3().`,
    );
  }

  const { upload: uploadInput, multipart: multipartInput } = splitUpload(
    route.upload,
  );
  const upload = normalizeFeature(uploadInput);
  const download = normalizeFeature<DownloadConfig>(route.download);
  const deleteFeature = normalizeFeature<DeleteConfig>(route.delete);
  const multipart = normalizeFeature<MultipartConfig>(multipartInput);

  if (!upload.enabled && !download.enabled && !deleteFeature.enabled) {
    throw new Error(
      `dimahS3 route "${name}": enable upload, download, or delete.`,
    );
  }

  const resolvedUpload: ResolvedUploadConfig = upload.enabled
    ? { ...upload, multipart }
    : { enabled: false, multipart: { enabled: false } };

  if (resolvedUpload.enabled) {
    const maxFileSize = resolvedUpload.maxFileSize;
    if (
      maxFileSize != null &&
      (!Number.isFinite(maxFileSize) || maxFileSize <= 0)
    ) {
      throw new Error(
        `dimahS3 route "${name}": maxFileSize must be a positive number.`,
      );
    }
  }

  return {
    name,
    client,
    bucket,
    keyPrefix: resolveKeyPrefix(name, route.keyPrefix),
    guard: route.guard,
    skippedPluginIds: skippedPluginIds(route.plugins),
    upload: resolvedUpload,
    download,
    delete: deleteFeature,
  };
}

export function normalizeRoutes(
  config: DimahS3Config,
): Record<string, ResolvedRoute> {
  const entries = Object.entries(config.routes);
  if (entries.length === 0) {
    throw new Error("dimahS3: at least one route is required.");
  }
  const routes: Record<string, ResolvedRoute> = {};
  for (const [name, route] of entries) {
    routes[name] = normalizeRoute(name, route, config);
  }
  assertDistinctKeyPrefixes(routes);
  return routes;
}

function prefixesOverlap(a: string, b: string): boolean {
  return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}

/** Nested or identical `keyPrefix` values would let one route access another's keys. */
function assertDistinctKeyPrefixes(
  routes: Record<string, ResolvedRoute>,
): void {
  const named = Object.entries(routes).filter(
    (entry): entry is [string, ResolvedRoute & { keyPrefix: string }] =>
      entry[1].keyPrefix !== false,
  );
  for (let i = 0; i < named.length; i++) {
    for (let j = i + 1; j < named.length; j++) {
      const [nameA, routeA] = named[i];
      const [nameB, routeB] = named[j];
      if (prefixesOverlap(routeA.keyPrefix, routeB.keyPrefix)) {
        throw new Error(
          `dimahS3: routes "${nameA}" and "${nameB}" have overlapping keyPrefix values ("${routeA.keyPrefix}" and "${routeB.keyPrefix}").`,
        );
      }
    }
  }
}
