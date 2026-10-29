import { S3_DEFAULT_EXPIRES_IN, S3_MAX_EXPIRES_IN } from "@dimah-s3/core";

/**
 * Coerce an upload/download `expiresIn` to a positive integer, then clamp
 * to {@link maxExpiresIn} (SigV4 max by default).
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
 * Signed download TTL.
 * `download.resolve` wins, then the shorter of the client request and the
 * route cap. Both are clamped to `maxExpiresIn`.
 */
export function clampDownloadExpiresIn(options: {
  /** Client `expiresIn`, when the query sent one. */
  requested?: number;
  /** Route `download.expiresIn`. Omitted uses the protocol default. */
  routeExpiresIn?: number;
  /** `download.resolve` return. Replaces the cap and the client request. */
  resolvedExpiresIn?: number;
  /** Instance ceiling. Defaults to the SigV4 maximum. */
  maxExpiresIn?: number;
}): number {
  const max = options.maxExpiresIn;
  if (options.resolvedExpiresIn != null) {
    return normalizeExpiresIn(options.resolvedExpiresIn, max);
  }
  const cap = normalizeExpiresIn(options.routeExpiresIn, max);
  if (options.requested == null) return cap;
  return Math.min(normalizeExpiresIn(options.requested, max), cap);
}
