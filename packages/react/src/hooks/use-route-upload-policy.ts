"use client";

import { useContext, useEffect, useState } from "react";
import type { S3Api, S3RouteName } from "@dimah-s3/core";
import { S3Context } from "@/s3-provider";
import { useLiveRef } from "@/internal-helpers";
import {
  loadRouteCatalog,
  mergeRouteUploadPolicy,
  type RouteUploadPolicy,
} from "@/helpers/load-route-catalog";

export type CatalogLoadStatus = "idle" | "loading" | "ready" | "error";

export type UseRouteUploadPolicyOptions = RouteUploadPolicy & {
  api?: S3Api;
  route: S3RouteName;
};

export type UseRouteUploadPolicyReturn = RouteUploadPolicy & {
  /** `GET /routes` fetch used to fill omitted `accept` / `maxFileSize`. */
  catalogStatus: CatalogLoadStatus;
  /** Set when {@link catalogStatus} is `"error"`. */
  catalogError: Error | null;
};

const warnedCatalogKeys = new Set<string>();

function toError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause));
}

function isDevelopment() {
  const env = (globalThis as { process?: { env?: { NODE_ENV?: string } } })
    .process?.env?.NODE_ENV;
  return env === "development";
}

function warnCatalogFailure(
  route: S3RouteName,
  hasExplicitConstraints: boolean,
  cause: unknown,
) {
  if (!isDevelopment()) return;
  if (hasExplicitConstraints) return;
  const key = String(route);
  if (warnedCatalogKeys.has(key)) return;
  warnedCatalogKeys.add(key);
  console.warn(
    `[@dimah-s3/react] Route catalog failed for "${key}". Pass accept/maxFileSize on useUpload, or check GET /routes. Client-side constraints will not come from the server.`,
    cause,
  );
}

function hasExplicitConstraints(options: RouteUploadPolicy) {
  return options.accept != null || options.maxFileSize != null;
}

type CatalogSnapshot = {
  api: S3Api;
  route: S3RouteName;
  policy: RouteUploadPolicy;
  status: Extract<CatalogLoadStatus, "ready" | "error">;
  error: Error | null;
};

/**
 * Client UX constraints for a named upload route.
 * Catalog values fill in omitted `accept` / `maxFileSize` / `multipart` /
 * `checksum`. Explicit options always win.
 *
 * A failed catalog does not block uploads — the server still enforces
 * constraints. {@link UseRouteUploadPolicyReturn.catalogStatus} is `"error"`
 * so the UI can show that client-side accept/size did not sync.
 */
export function useRouteUploadPolicy(
  options: UseRouteUploadPolicyOptions,
): UseRouteUploadPolicyReturn {
  const contextApi = useContext(S3Context);
  const api = options.api ?? contextApi;
  const optsRef = useLiveRef(options);
  const [snapshot, setSnapshot] = useState<CatalogSnapshot | null>(null);
  const snapshotMatches =
    snapshot !== null &&
    snapshot.api === api &&
    snapshot.route === options.route;

  const catalogPolicy = snapshotMatches ? snapshot.policy : {};
  const catalogStatus: CatalogLoadStatus = !api
    ? "idle"
    : snapshotMatches
      ? snapshot.status
      : "loading";
  const catalogError = snapshotMatches ? snapshot.error : null;

  useEffect(() => {
    if (!api) return;
    let cancelled = false;
    void loadRouteCatalog(api)
      .then((catalog) => {
        if (cancelled) return;
        setSnapshot({
          api,
          route: options.route,
          policy: mergeRouteUploadPolicy(catalog, options.route, {}),
          status: "ready",
          error: null,
        });
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setSnapshot({
          api,
          route: options.route,
          policy: {},
          status: "error",
          error: toError(cause),
        });
        warnCatalogFailure(
          optsRef.current.route,
          hasExplicitConstraints(optsRef.current),
          cause,
        );
      });
    return () => {
      cancelled = true;
    };
  }, [api, options.route, optsRef]);

  return {
    ...mergeRouteUploadPolicy(null, options.route, {
      accept: options.accept ?? catalogPolicy.accept,
      maxFileSize: options.maxFileSize ?? catalogPolicy.maxFileSize,
      multipart: options.multipart ?? catalogPolicy.multipart,
      checksum: options.checksum ?? catalogPolicy.checksum,
    }),
    catalogStatus,
    catalogError,
  };
}
