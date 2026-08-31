import type { S3ObjectAcl } from "@dimah-s3/core";
import { errors } from "@/errors";
import { assertDeclaredConstraints } from "@/helpers/constraints";
import { runHook } from "@/helpers/hooks";
import {
  resolveStoredTarget,
  resolveUploadTarget,
} from "@/helpers/resolve-target";
import type {
  OpenedRoute,
  ResolvedDimahS3Config,
  ResolvedRoute,
  RouteOperation,
  StoredObjectContext,
} from "@/types";

export type OpenedTarget<F extends RouteOperation> = {
  route: OpenedRoute<F>;
  key: string;
  bucket: string;
  stored: StoredObjectContext;
};

export type OpenedUploadTarget<F extends "upload" | "multipart"> =
  OpenedTarget<F> & {
    metadata?: Record<string, string>;
    acl: S3ObjectAcl;
  };

export type OpenUploadInput = {
  route: string;
  fileName: string;
  fileSize: number;
  contentType?: string;
  metadata?: Record<string, string>;
};

export function getResolvedRoute(
  config: ResolvedDimahS3Config,
  name: string,
): ResolvedRoute {
  const route = config.routes[name];
  if (!route) {
    throw errors.unknownRoute(name);
  }
  return route;
}

function featureIsEnabled(
  route: ResolvedRoute,
  feature: RouteOperation,
): boolean {
  if (feature === "multipart") return route.upload.multipart.enabled;
  return route[feature].enabled;
}

/** Disabled features respond 404 (`FEATURE_DISABLED`) from both HTTP and `s3.api`. */
export function assertFeatureEnabled<F extends RouteOperation>(
  route: ResolvedRoute,
  feature: F,
): asserts route is OpenedRoute<F> {
  if (!featureIsEnabled(route, feature)) {
    throw errors.featureDisabled(feature);
  }
}

/** Lookup the named route, reject a disabled feature, run the route `guard`. */
export async function openRoute<F extends RouteOperation>(
  config: ResolvedDimahS3Config,
  name: string,
  request: Request,
  feature: F,
): Promise<OpenedRoute<F>> {
  const route = getResolvedRoute(config, name);
  assertFeatureEnabled(route, feature);
  await runHook(route.guard, { request, route: route.name });
  return route;
}

export function storedObjectContext(
  request: Request,
  route: Pick<ResolvedRoute, "name" | "bucket">,
  key: string,
): StoredObjectContext {
  return { request, route: route.name, key, bucket: route.bucket };
}

/**
 * {@link openRoute} plus file constraints and server-owned key generation.
 * Used by upload presign and multipart init.
 */
export async function openUploadTarget<F extends "upload" | "multipart">(
  config: ResolvedDimahS3Config,
  input: OpenUploadInput,
  request: Request,
  feature: F,
): Promise<OpenedUploadTarget<F>> {
  const route = await openRoute(config, input.route, request, feature);
  const fileSize = Math.floor(input.fileSize);
  const fileName = input.fileName;
  assertDeclaredConstraints(route.upload, {
    fileName,
    fileSize,
    contentType: input.contentType,
  });
  const target = await resolveUploadTarget(route, {
    request,
    route: route.name,
    file: {
      name: fileName,
      size: fileSize,
      type: input.contentType,
    },
    clientMetadata: input.metadata,
  });
  return {
    route,
    ...target,
    stored: storedObjectContext(request, route, target.key),
  };
}

/** {@link openRoute} plus the stored-key namespace check. */
export async function openStoredTarget<F extends RouteOperation>(
  config: ResolvedDimahS3Config,
  input: { route: string; key: string },
  request: Request,
  feature: F,
): Promise<OpenedTarget<F>> {
  const route = await openRoute(config, input.route, request, feature);
  const target = resolveStoredTarget(route, input.key);
  return {
    route,
    ...target,
    stored: storedObjectContext(request, route, target.key),
  };
}
