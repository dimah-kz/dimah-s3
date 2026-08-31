import { errors } from "@/errors";
import type { ResolvedRoutePolicy } from "@/types";

export type FeatureFlag = "upload" | "download" | "delete" | "multipart";

/** Disabled features respond 404 (`FEATURE_DISABLED`) from both HTTP and `s3.api`. */
export function assertFeatureEnabled(
  route: ResolvedRoutePolicy,
  feature: FeatureFlag,
): void {
  if (route[feature]?.enabled !== true) {
    throw errors.featureDisabled(feature);
  }
}
