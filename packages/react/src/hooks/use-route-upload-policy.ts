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
  const [catalogPolicy, setCatalogPolicy] = useState<RouteUploadPolicy>({});
  const [catalogStatus, setCatalogStatus] = useState<CatalogLoadStatus>(
    api ? "loading" : "idle",
  );
  const [catalogError, setCatalogError] = useState<Error | null>(null);

  useEffect(() => {
    if (!api) {
      setCatalogPolicy({});
      setCatalogStatus("idle");
      setCatalogError(null);
      return;
    }
    let cancelled = false;
    setCatalogPolicy({});
    setCatalogStatus("loading");
    setCatalogError(null);
    void loadRouteCatalog(api)
      .then((catalog) => {
        if (cancelled) return;
        setCatalogPolicy(
          mergeRouteUploadPolicy(catalog, optsRef.current.route, {}),
        );
        setCatalogStatus("ready");
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        const error = toError(cause);
        setCatalogError(error);
        setCatalogStatus("error");
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
