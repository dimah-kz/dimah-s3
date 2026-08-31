import { ROUTE_NAME_PATTERN } from "@dimah-s3/core";
import type { DimahS3RouteConfig } from "@/types/config";

/**
 * Identity helper so route configs infer as a distinct policy object.
 *
 * ```ts
 * routes: {
 *   uploads: route({ upload: { fileTypes: ["image/*"] } }),
 * }
 * ```
 */
export function route<const T extends DimahS3RouteConfig>(config: T): T {
  return config;
}

export function assertRouteName(name: string): void {
  if (!ROUTE_NAME_PATTERN.test(name)) {
    throw new Error(
      `dimahS3 route "${name}" is invalid. Use a letter followed by up to 63 letters, digits, underscores, or hyphens.`,
    );
  }
}
