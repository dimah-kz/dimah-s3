import type { RouteCatalogResponse, S3Api, S3RouteName } from "@dimah-s3/core";

const catalogByApi = new WeakMap<S3Api, Promise<RouteCatalogResponse>>();

/** Constraints copied from `GET /routes` for one named upload route. */
export type RouteUploadPolicy = {
  accept?: string[];
  maxFileSize?: number;
  multipart?: boolean;
  checksum?: boolean;
};

/**
 * Load and cache the server route catalog for an `S3Api`.
 * Failures are not cached so a later call can retry.
 */
export function loadRouteCatalog(api: S3Api): Promise<RouteCatalogResponse> {
  const cached = catalogByApi.get(api);
  if (cached) return cached;
  const pending = api.catalog().catch((err: unknown) => {
    catalogByApi.delete(api);
    throw err;
  });
  catalogByApi.set(api, pending);
  return pending;
}

/** Explicit hook options win over catalog values. */
export function mergeRouteUploadPolicy(
  catalog: RouteCatalogResponse | null | undefined,
  route: S3RouteName,
  overrides: RouteUploadPolicy,
): RouteUploadPolicy {
  const upload = catalog?.routes[route]?.upload;
  const fromCatalog: RouteUploadPolicy =
    upload?.enabled === true
      ? {
          accept: upload.fileTypes,
          maxFileSize: upload.maxFileSize,
          multipart: upload.multipart ? true : undefined,
          checksum: upload.checksum,
        }
      : {};
  return {
    accept: overrides.accept ?? fromCatalog.accept,
    maxFileSize: overrides.maxFileSize ?? fromCatalog.maxFileSize,
    multipart: overrides.multipart ?? fromCatalog.multipart,
    checksum: overrides.checksum ?? fromCatalog.checksum,
  };
}

/** Fetch the catalog (best-effort) and merge with hook overrides. */
export async function resolveRouteUploadPolicy(
  api: S3Api | null | undefined,
  route: S3RouteName,
  overrides: RouteUploadPolicy,
): Promise<RouteUploadPolicy> {
  if (!api) return overrides;
  try {
    const catalog = await loadRouteCatalog(api);
    return mergeRouteUploadPolicy(catalog, route, overrides);
  } catch {
    return overrides;
  }
}
