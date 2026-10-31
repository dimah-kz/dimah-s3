import * as z from "zod";
import { normalizeObjectKey } from "@/helpers/normalize-object-key";

/** Fallback when the route omits `expiresIn`. */
export const S3_DEFAULT_EXPIRES_IN = 600;

/** AWS SigV4 presign maximum (7 days), in seconds. */
export const S3_MAX_EXPIRES_IN = 604_800;

/** S3 POST object maximum (5 GiB), in bytes. */
export const S3_MAX_POST_OBJECT_BYTES = 5 * 1024 * 1024 * 1024;

/** S3 multipart part number maximum. */
export const S3_MAX_PART_NUMBER = 10_000;

/** S3 multipart part minimum (5 MiB). Only the last part may be smaller. */
export const S3_MIN_PART_SIZE = 5 * 1024 * 1024;

/** S3 multipart part maximum (5 GiB). */
export const S3_MAX_PART_SIZE = 5 * 1024 * 1024 * 1024;

/** Preferred part size when the route sets no `multipart.partSize` (8 MiB). */
export const S3_DEFAULT_PART_SIZE = 8 * 1024 * 1024;

/** S3 object maximum (5 TiB), in bytes. */
export const S3_MAX_OBJECT_SIZE = 5 * 1024 ** 4;

/** Wire limit for `name` and `type`, in UTF-8 bytes. */
export const S3_MAX_FILE_FIELD_BYTES = 255;

/** Upload ticket maximum, in characters. */
const MAX_UPLOAD_TICKET_LENGTH = 8192;

/** Max user-defined metadata entries on an upload body. */
export const S3_MAX_METADATA_ENTRIES = 32;

/** Named file-route identifier (`avatars`, `uploads`, …). */
export const ROUTE_NAME_PATTERN = /^[a-z][\w-]{0,63}$/i;

/** Non-empty trimmed string. */
export const trimmedString = z.string().trim().min(1);

/** Optional trimmed string. Blank or whitespace-only values are omitted. */
export const optionalTrimmedString = z.preprocess((value: unknown) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}, z.string().optional());

const utf8 = new TextEncoder();

/** Control characters (C0, DEL, C1). */
const CONTROL_CHARACTER = /\p{Cc}/u;

function fitsFileField(value: string): boolean {
  return utf8.encode(value).byteLength <= S3_MAX_FILE_FIELD_BYTES;
}

function hasNoControlCharacters(value: string): boolean {
  return !CONTROL_CHARACTER.test(value);
}

/**
 * File name on the wire. Trimmed, 1 to 255 UTF-8 bytes, no control
 * characters (they also bound the upload ticket size).
 */
export const fileNameSchema = trimmedString
  .refine(fitsFileField, {
    message: `File name exceeds ${S3_MAX_FILE_FIELD_BYTES} bytes`,
  })
  .refine(hasNoControlCharacters, {
    message: "File name contains control characters",
  });

/** MIME type on the wire. Trimmed, at most 255 UTF-8 bytes, no control characters. */
export const contentTypeSchema = z
  .string()
  .trim()
  .refine(fitsFileField, {
    message: `Content type exceeds ${S3_MAX_FILE_FIELD_BYTES} bytes`,
  })
  .refine(hasNoControlCharacters, {
    message: "Content type contains control characters",
  });

/** Optional file name. Blank or whitespace-only values are omitted. */
export const optionalFileNameSchema = optionalTrimmedString.pipe(
  fileNameSchema.optional(),
);

/** Optional MIME type. Blank or whitespace-only values are omitted. */
export const optionalContentTypeSchema = optionalTrimmedString.pipe(
  contentTypeSchema.optional(),
);

/** Opaque upload ticket from presign or multipart init. Trimmed, 1 to 8192 characters. */
export const uploadTicketSchema = trimmedString.max(MAX_UPLOAD_TICKET_LENGTH);

export const routeNameSchema = trimmedString.regex(
  ROUTE_NAME_PATTERN,
  "Invalid route name",
);

/**
 * Stored object key — normalized, at most 1024 UTF-8 bytes, no `.` / `..` /
 * NUL / backslash segments.
 */
export const objectKeySchema = trimmedString.transform((value, ctx) => {
  const normalized = normalizeObjectKey(value);
  if (normalized == null) {
    ctx.issues.push({
      code: "custom",
      message: "Invalid object key",
      input: value,
    });
    return z.NEVER;
  }
  return normalized;
});

/** 1-based S3 multipart part number. */
export const partNumberSchema = z.int().min(1).max(S3_MAX_PART_NUMBER);

export const s3ObjectAclSchema = z.enum(["private", "public-read"]);

/**
 * S3 `ChecksumSHA256` — 32-byte SHA-256 as standard base64 (padding optional).
 * Matches `sha256Base64()` output and the padded form AWS also accepts.
 */
export const sha256ChecksumSchema = z.stringFormat(
  "sha256-base64",
  /^[A-Z0-9+/]{43}=?$/i,
);

/** Optional checksum; blank / whitespace-only values are omitted. */
export const optionalChecksumSchema = optionalTrimmedString.pipe(
  sha256ChecksumSchema.optional(),
);

const metadataKeySchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/i, "Invalid metadata key")
  .max(128);

export const metadataSchema = z
  .record(metadataKeySchema, z.string().max(2048))
  .refine((value) => Object.keys(value).length <= S3_MAX_METADATA_ENTRIES, {
    message: "Too many metadata entries",
  });
