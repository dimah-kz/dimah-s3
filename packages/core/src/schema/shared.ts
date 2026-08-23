import { z } from "zod";

/** Fallback when the client omits `expiresIn`. */
export const S3_DEFAULT_EXPIRES_IN = 600;

/** AWS SigV4 presign maximum (7 days), in seconds. */
export const S3_MAX_EXPIRES_IN = 604_800;

/** Non-empty trimmed string. */
export const trimmedString = z.string().trim().min(1);

/** Optional non-empty trimmed string (empty / missing → omitted). */
export const optionalTrimmedString = z.string().trim().min(1).optional();

export const s3ObjectAclSchema = z.enum(["private", "public-read"]);

export const metadataSchema = z.record(z.string(), z.string());

/** Optional body `expiresIn` — positive seconds, capped at {@link S3_MAX_EXPIRES_IN}. */
export const optionalExpiresInSchema = z
  .number()
  .positive()
  .max(S3_MAX_EXPIRES_IN)
  .optional();

/** Optional query `expiresIn` — numbers arrive as strings. */
export const optionalCoerceExpiresInSchema = z.coerce
  .number()
  .positive()
  .max(S3_MAX_EXPIRES_IN)
  .optional();
