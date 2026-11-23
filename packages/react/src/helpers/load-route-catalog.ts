import type { RouteCatalogResponse, S3Api, S3RouteName } from "@dimah-s3/core";
import { toClientError } from "@/internal/client-error";

const catalogByApi = new WeakMap<S3Api, Promise<RouteCatalogResponse>>();

/** What a named route allows for uploads, from `GET /routes`. */
export type RouteUploadPolicy = {
  /** Accepted file types (`image/*`, `.pdf`). Omitted when any type is allowed. */
  accept?: string[];
  /** Max file size in bytes. */
  maxFileSize?: number;
  /** Whether large files go through multipart upload. */
  multipart: boolean;
  /** Whether single-shot uploads must send a SHA-256 checksum. */
  checksum: boolean;
};

/** Client options that narrow a {@link RouteUploadPolicy}. */
export type RouteUploadPolicyOptions = {
  accept?: readonly string[];
  maxFileSize?: number;
  /** `false` turns multipart off even when the route allows it. */
  multipart?: boolean;
};

/**
 * Loads the route catalog for an `S3Api` and caches it per `S3Api`.
 * A failure is not cached, so a later call retries, and it rejects with an
 * `APIError`.
 */
export function loadRouteCatalog(api: S3Api): Promise<RouteCatalogResponse> {
  const cached = catalogByApi.get(api);
  if (cached) return cached;
  const pending = api.catalog().catch((error: unknown) => {
    catalogByApi.delete(api);
    throw toClientError(error);
  });
  catalogByApi.set(api, pending);
  return pending;
}

/**
 * The upload policy of `route` in `catalog`. A route that is missing, has
 * uploads disabled, or a catalog that is not loaded yet (`null`) allows
 * neither multipart nor checksums and sets no constraints.
 */
export function resolveRouteUploadPolicy(
  catalog: RouteCatalogResponse | null | undefined,
  route: S3RouteName,
): RouteUploadPolicy {
  const upload = catalog?.routes[route]?.upload;
  if (upload?.enabled !== true) return { multipart: false, checksum: false };
  return {
    ...(upload.fileTypes?.length ? { accept: [...upload.fileTypes] } : {}),
    ...(upload.maxFileSize === undefined
      ? {}
      : { maxFileSize: upload.maxFileSize }),
    multipart: upload.multipart,
    checksum: upload.checksum,
  };
}

/**
 * Narrows a route policy with client options. The stricter constraint wins:
 * the smaller `maxFileSize`, and the `accept` tokens both lists allow
 * (`image/png` within `image/*`). An option extension is kept against a
 * route MIME type (`.png` within `image/*`); the server still enforces the
 * route. When the lists share nothing, the route's list is kept.
 * `multipart` needs the route and an option that is not `false`; `checksum`
 * always follows the route.
 */
export function mergeRouteUploadPolicy(
  policy: RouteUploadPolicy,
  options: RouteUploadPolicyOptions,
): RouteUploadPolicy {
  const accept = narrowAccept(options.accept, policy.accept);
  const maxFileSize = smaller(options.maxFileSize, policy.maxFileSize);
  return {
    ...(accept ? { accept } : {}),
    ...(maxFileSize === undefined ? {} : { maxFileSize }),
    multipart: policy.multipart && options.multipart !== false,
    checksum: policy.checksum,
  };
}

function smaller(a: number | undefined, b: number | undefined) {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return Math.min(a, b);
}

function narrowAccept(
  options: readonly string[] | undefined,
  route: readonly string[] | undefined,
): string[] | undefined {
  if (!options?.length) return route?.length ? [...route] : undefined;
  if (!route?.length) return [...options];
  const tokens = new Set<string>();
  for (const option of options) {
    for (const allowed of route) {
      const token = narrowToken(option, allowed);
      if (token !== undefined) tokens.add(token);
    }
  }
  return tokens.size > 0 ? [...tokens] : [...route];
}

/** The narrower of two accept tokens, or `undefined` when they share nothing. */
function narrowToken(option: string, allowed: string): string | undefined {
  const a = option.toLowerCase();
  const b = allowed.toLowerCase();
  if (a === b) return option;
  const aIsExtension = a.startsWith(".");
  const bIsExtension = b.startsWith(".");
  // An option extension is taken to name a type inside the route's MIME
  // type (`.png` within `image/*`). A MIME option cannot be checked against
  // a route extension, so it is dropped.
  if (aIsExtension || bIsExtension) {
    return aIsExtension && !bIsExtension ? option : undefined;
  }
  if (b.endsWith("/*") && a.startsWith(b.slice(0, -1))) return option;
  if (a.endsWith("/*") && b.startsWith(a.slice(0, -1))) return allowed;
  return undefined;
}
