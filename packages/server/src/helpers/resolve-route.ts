import { errors } from "@/errors";
import { runHook } from "@/helpers/hooks";
import { resolveStoredTarget } from "@/helpers/resolve-target";
import type { ResolvedDimahS3Config, ResolvedRoutePolicy } from "@/types";

export type FeatureFlag = "upload" | "download" | "delete" | "multipart";

export function getResolvedRoute(
  config: ResolvedDimahS3Config,
  name: string,
): ResolvedRoutePolicy {
  const route = config.routes[name];
  if (!route) {
    throw errors.unknownRoute(name);
  }
  return route;
}

/** Disabled features respond 404 (`FEATURE_DISABLED`) from both HTTP and `s3.api`. */
export function assertFeatureEnabled(
  route: ResolvedRoutePolicy,
  feature: FeatureFlag,
): void {
  const enabled =
    feature === "multipart"
      ? route.upload.multipart.enabled
      : route[feature].enabled;
  if (!enabled) {
    throw errors.featureDisabled(feature);
  }
}

/** Lookup the named route, reject a disabled feature, run the route `guard`. */
export async function openRoute(
  config: ResolvedDimahS3Config,
  name: string,
  request: Request,
  feature: FeatureFlag,
): Promise<ResolvedRoutePolicy> {
  const route = getResolvedRoute(config, name);
  assertFeatureEnabled(route, feature);
  await runHook(route.guard, { request, route: route.name });
  return route;
}

/** {@link openRoute} plus the stored-key namespace check. */
export async function openStoredTarget(
  config: ResolvedDimahS3Config,
  input: { route: string; key: string },
  request: Request,
  feature: FeatureFlag,
): Promise<{ route: ResolvedRoutePolicy; key: string; bucket: string }> {
  const route = await openRoute(config, input.route, request, feature);
  const target = resolveStoredTarget(route, input.key);
  return { route, ...target };
}
