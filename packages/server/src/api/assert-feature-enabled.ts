import { errors } from "../errors";
import { isFeatureEnabled } from "../helpers/resolve-target";
import type { ResolvedDimahS3Config } from "../types";

export type FeatureFlag = "upload" | "download" | "delete" | "multipart";

/** Disabled features respond 404 (`FEATURE_DISABLED`) from both HTTP and `s3.api`. */
export function assertFeatureEnabled(
  config: ResolvedDimahS3Config,
  feature: FeatureFlag,
): void {
  if (!isFeatureEnabled(config, feature)) {
    throw errors.featureDisabled(feature);
  }
}
