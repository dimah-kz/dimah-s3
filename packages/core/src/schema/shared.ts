import { z } from "zod";
import {
  normalizeObjectKey,
  S3_MAX_OBJECT_KEY_LENGTH,
} from "@/helpers/normalize-object-key";

/** Fallback when the route omits `expiresIn`. */
export const S3_DEFAULT_EXPIRES_IN = 600;

/** AWS SigV4 presign maximum (7 days), in seconds. */
export const S3_MAX_EXPIRES_IN = 604_800;

/** S3 POST object maximum (5 GiB), in bytes. */
export const S3_MAX_POST_OBJECT_BYTES = 5 * 1024 * 1024 * 1024;

/** S3 multipart part number maximum. */
export const S3_MAX_PART_NUMBER = 10_000;

/** Max user-defined metadata entries on an upload body. */
export const S3_MAX_METADATA_ENTRIES = 32;

/** Named file-route identifier (`avatars`, `uploads`, …). */
export const ROUTE_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;

/** Non-empty trimmed string. */
export const trimmedString = z.string().trim().min(1);

/** Optional trimmed string. Blank or whitespace-only values are omitted. */
export const optionalTrimmedString = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}, z.string().optional());

export const routeNameSchema = trimmedString.regex(
  ROUTE_NAME_PATTERN,
  "Invalid route name",
);

/** Stored object key — normalized, no `.` / `..` / NUL / backslash segments. */
export const objectKeySchema = trimmedString
  .max(S3_MAX_OBJECT_KEY_LENGTH)
  .refine((value) => normalizeObjectKey(value) != null, {
    message: "Invalid object key",
  })
  .transform((value) => normalizeObjectKey(value)!);

/** 1-based S3 multipart part number. */
export const partNumberSchema = z.number().int().min(1).max(S3_MAX_PART_NUMBER);

export const s3ObjectAclSchema = z.enum(["private", "public-read"]);

const metadataKeySchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/i, "Invalid metadata key")
  .max(128);

export const metadataSchema = z
  .record(metadataKeySchema, z.string().max(2048))
  .refine((value) => Object.keys(value).length <= S3_MAX_METADATA_ENTRIES, {
    message: "Too many metadata entries",
  });
