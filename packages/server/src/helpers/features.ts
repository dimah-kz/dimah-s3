import type {
  DeleteConfig,
  DimahS3RouteConfig,
  DownloadConfig,
  FeatureToggle,
  MultipartConfig,
  ResolvedRoutePolicy,
  UploadConfig,
} from "@/types";
import { assertRouteName } from "@/route";
import type { DimahS3Config } from "@/types/config";

export function normalizeFeature<T extends object>(
  value: FeatureToggle<T> | undefined,
): (T & { enabled: boolean }) | undefined {
  if (value === undefined) return undefined;
  if (value === false) return { enabled: false } as T & { enabled: boolean };
  if (value === true) return { enabled: true } as T & { enabled: boolean };
  return { ...value, enabled: true };
}

function skippedPluginIds(
  plugins: DimahS3RouteConfig["plugins"],
): Set<string> {
  const ids = new Set<string>();
  if (!plugins) return ids;
  for (const [id, enabled] of Object.entries(plugins)) {
    if (enabled === false) ids.add(id);
  }
  return ids;
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

  const upload = normalizeFeature<UploadConfig>(
    route.upload === undefined ? true : route.upload,
  );
  const download = normalizeFeature<DownloadConfig>(route.download);
  const deleteFeature = normalizeFeature<DeleteConfig>(route.delete);

  if (route.multipart === true && upload?.enabled === false) {
    throw new Error(
      `dimahS3 route "${name}": multipart requires upload to be enabled.`,
    );
  }

  const multipart = normalizeFeature<MultipartConfig>(
    route.multipart === true ? true : false,
  );

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
    fileTypes: upload?.fileTypes,
    maxFileSize: upload?.maxFileSize,
    object: upload?.object,
    acl: upload?.acl,
    method: upload?.method,
    expiresIn: upload?.expiresIn,
    guard: route.guard,
    skippedPluginIds: skippedPluginIds(route.plugins),
    upload,
    download,
    delete: deleteFeature,
    multipart,
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
