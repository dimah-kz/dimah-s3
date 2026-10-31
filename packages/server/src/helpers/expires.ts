import { S3_DEFAULT_EXPIRES_IN, S3_MAX_EXPIRES_IN } from "@dimah-s3/core";

/**
 * Coerces a TTL in seconds to a positive integer, then caps it at
 * `maxExpiresIn` (the SigV4 maximum by default). A value that is not a
 * positive number becomes the protocol default.
 */
export function normalizeExpiresIn(
  value: unknown,
  maxExpiresIn: number = S3_MAX_EXPIRES_IN,
): number {
  const n = Number(value);
  const expires =
    Number.isFinite(n) && n > 0 ? Math.floor(n) : S3_DEFAULT_EXPIRES_IN;
  const max =
    Number.isFinite(maxExpiresIn) && maxExpiresIn > 0
      ? Math.floor(maxExpiresIn)
      : S3_MAX_EXPIRES_IN;
  return Math.min(expires, max);
}

/**
 * Signed download TTL in seconds. A `download.resolve` value wins, capped
 * by the instance `maxExpiresIn`. Otherwise the client value is used when
 * it is shorter than the route `download.maxExpiresIn`, which is the
 * default.
 */
export function clampDownloadExpiresIn(options: {
  /** Client `expiresIn`, when the query sent one. */
  requested?: number;
  /** `download.resolve` value. Replaces the route cap and the client value. */
  resolved?: number;
  /** Route `download.maxExpiresIn`, already capped by the instance. */
  routeMaxExpiresIn: number;
  /** Instance `maxExpiresIn`. */
  maxExpiresIn: number;
}): number {
  if (options.resolved !== undefined) {
    return normalizeExpiresIn(options.resolved, options.maxExpiresIn);
  }
  if (options.requested === undefined) return options.routeMaxExpiresIn;
  return normalizeExpiresIn(options.requested, options.routeMaxExpiresIn);
}
