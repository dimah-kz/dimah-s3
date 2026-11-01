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
