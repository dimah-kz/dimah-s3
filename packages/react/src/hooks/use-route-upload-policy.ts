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

export type UseRouteUploadPolicyOptions = RouteUploadPolicy & {
  api?: S3Api;
  route: S3RouteName;
};

/**
 * Client UX constraints for a named upload route.
 * Catalog values fill in omitted `accept` / `maxFileSize` / `multipart` /
 * `checksum`. Explicit options always win.
 */
export function useRouteUploadPolicy(
  options: UseRouteUploadPolicyOptions,
): RouteUploadPolicy {
  const contextApi = useContext(S3Context);
  const api = options.api ?? contextApi;
  const optsRef = useLiveRef(options);
  const [catalogPolicy, setCatalogPolicy] = useState<RouteUploadPolicy>({});

  useEffect(() => {
    if (!api) return;
    let cancelled = false;
    void loadRouteCatalog(api)
      .then((catalog) => {
        if (cancelled) return;
        setCatalogPolicy(
          mergeRouteUploadPolicy(catalog, optsRef.current.route, {}),
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [api, options.route, optsRef]);

  return mergeRouteUploadPolicy(null, options.route, {
    accept: options.accept ?? catalogPolicy.accept,
    maxFileSize: options.maxFileSize ?? catalogPolicy.maxFileSize,
    multipart: options.multipart ?? catalogPolicy.multipart,
    checksum: options.checksum ?? catalogPolicy.checksum,
  });
}
