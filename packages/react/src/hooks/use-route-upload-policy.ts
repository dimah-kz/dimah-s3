"use client";

import { useCallback, useContext, useEffect, useState } from "react";
import type {
  APIError,
  RouteCatalogResponse,
  S3Api,
  S3RouteName,
} from "@dimah-s3/core";
import { S3Context } from "@/s3-provider";
import { requireApi, toClientError } from "@/internal/client-error";
import {
  loadRouteCatalog,
  mergeRouteUploadPolicy,
  resolveRouteUploadPolicy,
  type RouteUploadPolicy,
  type RouteUploadPolicyOptions,
} from "@/helpers/load-route-catalog";

/** Where the route catalog (`GET /routes`) is in loading. */
export type CatalogLoadStatus = "loading" | "ready" | "error";

/** Options for {@link useRouteUploadPolicy}. */
export type UseRouteUploadPolicyOptions = RouteUploadPolicyOptions & {
  /** Optional when an `<S3Provider>` is in the tree. */
  api?: S3Api;
  route: S3RouteName;
};

/** The route's upload policy narrowed by the options, plus the catalog state. */
export type UseRouteUploadPolicyReturn = RouteUploadPolicy & {
  status: CatalogLoadStatus;
  /** Why the catalog failed to load, when `status` is `"error"`. */
  error: APIError | null;
};

/** One settled catalog load for an `S3Api`. */
type CatalogState = {
  api: S3Api;
  attempt: number;
  catalog: RouteCatalogResponse | null;
  error: APIError | null;
};

/**
 * The upload policy of a named route: the route catalog narrowed by the
 * options. The stricter `accept` and `maxFileSize` win, `multipart` needs the
 * route and an option that is not `false`, and `checksum` follows the route.
 *
 * Until the catalog loads, and when it fails, only the options apply and
 * neither multipart nor checksums are on. The catalog is cached per `S3Api`,
 * so every hook for the same API shares one request.
 */
export function useRouteUploadPolicy(
  options: UseRouteUploadPolicyOptions,
): UseRouteUploadPolicyReturn {
  return useRouteUploadPolicyState(options)[0];
}

/**
 * @internal {@link useRouteUploadPolicy} plus a function that loads the
 * catalog again, such as after it failed.
 */
export function useRouteUploadPolicyState(
  options: UseRouteUploadPolicyOptions,
): [policy: UseRouteUploadPolicyReturn, reload: () => void] {
  const contextApi = useContext(S3Context);
  const api = requireApi(options.api ?? contextApi, "useRouteUploadPolicy");
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<CatalogState | null>(null);

  useEffect(() => {
    let active = true;
    loadRouteCatalog(api).then(
      (catalog) => {
        if (active) setState({ api, attempt, catalog, error: null });
      },
      (error: unknown) => {
        if (active) {
          setState({
            api,
            attempt,
            catalog: null,
            error: toClientError(error),
          });
        }
      },
    );
    return () => {
      active = false;
    };
  }, [api, attempt]);

  const reload = useCallback(() => {
    setAttempt((current) => current + 1);
  }, []);

  // A load for another API or an older attempt does not count.
  const settled =
    state !== null && state.api === api && state.attempt === attempt
      ? state
      : null;
  const policy = mergeRouteUploadPolicy(
    resolveRouteUploadPolicy(settled?.catalog, options.route),
    {
      accept: options.accept,
      maxFileSize: options.maxFileSize,
      multipart: options.multipart,
    },
  );
  const status: CatalogLoadStatus =
    settled === null ? "loading" : settled.error ? "error" : "ready";
  return [{ ...policy, status, error: settled?.error ?? null }, reload];
}
