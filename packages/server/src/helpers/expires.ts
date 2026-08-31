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
