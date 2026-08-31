import type { DimahS3RouteConfig } from "@/types/config";

/** Same rule as `@dimah-s3/core` `ROUTE_NAME_PATTERN`. */
const ROUTE_NAME_RE = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;

/**
 * Identity helper so route configs infer as a distinct policy object.
 *
 * ```ts
 * routes: {
 *   uploads: route({ upload: { fileTypes: ["image/*"] }, download: true }),
 * }
 * ```
 */
export function route<const T extends DimahS3RouteConfig>(config: T): T {
  return config;
}

export function assertRouteName(name: string): void {
  if (!ROUTE_NAME_RE.test(name)) {
    throw new Error(
      `dimahS3 route "${name}" is invalid. Use a letter followed by up to 63 letters, digits, underscores, or hyphens.`,
    );
  }
}
