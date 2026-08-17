import { errors } from "../errors";
import type { DimahS3Config } from "../types";

export type FeatureFlag = "upload" | "download" | "delete" | "multipart";

/** Disabled features respond 404 from both HTTP and `s3.api`. */
export function assertFeatureEnabled(
  config: DimahS3Config,
  feature: FeatureFlag,
): void {
  if (!config[feature]?.enabled) {
    throw errors.notFound();
  }
}
