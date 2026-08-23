import type { ResolvedDimahS3Config } from "@/types";

/**
 * Injected on every {@link createS3Endpoint} via better-call `routerContext`
 * (HTTP) and {@link bindEndpoints} (direct `s3.api` calls).
 */
export type S3EndpointContext = {
  config: ResolvedDimahS3Config;
  request: Request;
};
