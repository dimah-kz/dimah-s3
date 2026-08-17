import type { ServerErrors } from "../errors";
import type { DimahS3Config } from "../types";

/**
 * Injected on every {@link createS3Endpoint} via better-call `routerContext`
 * (HTTP) and {@link bindEndpoints} (direct `s3.api` calls).
 */
export type S3EndpointContext = {
  config: DimahS3Config;
  errors: ServerErrors;
  request: Request;
};
