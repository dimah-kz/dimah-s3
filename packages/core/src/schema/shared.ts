import { z } from "zod";

/** Fallback when the route omits `expiresIn`. */
export const S3_DEFAULT_EXPIRES_IN = 600;

/** AWS SigV4 presign maximum (7 days), in seconds. */
export const S3_MAX_EXPIRES_IN = 604_800;

/** S3 POST object maximum (5 GiB), in bytes. */
export const S3_MAX_POST_OBJECT_BYTES = 5 * 1024 * 1024 * 1024;

/** Named file-route identifier (`avatars`, `uploads`, …). */
export const ROUTE_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;

/** Non-empty trimmed string. */
export const trimmedString = z.string().trim().min(1);

/** Optional non-empty trimmed string (empty / missing → omitted). */
export const optionalTrimmedString = z.string().trim().min(1).optional();

export const routeNameSchema = trimmedString.regex(
  ROUTE_NAME_PATTERN,
  "Invalid route name",
);

export const s3ObjectAclSchema = z.enum(["private", "public-read"]);

export const metadataSchema = z.record(z.string(), z.string());
