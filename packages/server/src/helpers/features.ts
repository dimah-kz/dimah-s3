import type {
  DeleteConfig,
  DimahS3Config,
  DimahS3RouteConfig,
  DownloadConfig,
  FeatureToggle,
  MultipartConfig,
  ResolvedRoutePolicy,
  UploadConfig,
} from "@/types";
import { normalizeObjectKey } from "@/helpers/resolve-target";
import { assertRouteName } from "@/route";

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

export function normalizeFeature<T extends object>(
  value: FeatureToggle<T> | undefined,
): (T & { enabled: boolean }) | undefined {
  if (value === undefined) return undefined;
  if (value === false) return { enabled: false } as T & { enabled: boolean };
  if (value === true) return { enabled: true } as T & { enabled: boolean };
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
  upload: FeatureToggle<Omit<UploadConfig, "multipart">>;
  multipart: FeatureToggle<MultipartConfig> | undefined;
} {
  if (upload === undefined || upload === true) {
    return { upload: true, multipart: undefined };
  }
  if (upload === false) {
    return { upload: false, multipart: undefined };
  }
  const { multipart, ...rest } = upload;
  return { upload: rest, multipart };
}

export function normalizeRoute(
  name: string,
  route: DimahS3RouteConfig,
  instance: Pick<DimahS3Config, "client" | "bucket">,
): ResolvedRoutePolicy {
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
  const multipart = normalizeFeature<MultipartConfig>(
    multipartInput === undefined ? false : multipartInput,
  );

  const resolvedMultipart =
    upload?.enabled === true
      ? multipart
      : ({ enabled: false } as MultipartConfig & { enabled: boolean });

  if (
    upload?.enabled !== true &&
    download?.enabled !== true &&
    deleteFeature?.enabled !== true
  ) {
    throw new Error(
      `dimahS3 route "${name}": enable upload, download, or delete.`,
    );
  }

  return {
    name,
    client,
    bucket,
    keyPrefix: resolveKeyPrefix(name, route.keyPrefix),
    guard: route.guard,
    skippedPluginIds: skippedPluginIds(route.plugins),
    upload: upload ? { ...upload, multipart: resolvedMultipart } : upload,
    download,
    delete: deleteFeature,
  };
}

export function normalizeRoutes(
  config: DimahS3Config,
): Record<string, ResolvedRoutePolicy> {
  const entries = Object.entries(config.routes ?? {});
  if (entries.length === 0) {
    throw new Error("dimahS3: at least one route is required.");
  }
  const routes: Record<string, ResolvedRoutePolicy> = {};
  for (const [name, route] of entries) {
    routes[name] = normalizeRoute(name, route, config);
  }
  return routes;
}
