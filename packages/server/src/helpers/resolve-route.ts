import { errors } from "@/errors";
import type { ResolvedDimahS3Config, ResolvedRoutePolicy } from "@/types";

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
