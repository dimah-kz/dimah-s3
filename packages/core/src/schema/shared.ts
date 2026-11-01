import * as z from "zod";
import { BIDI_CONTROL } from "@/helpers/fit-file-name";
import { normalizeObjectKey } from "@/helpers/normalize-object-key";
import {
  ROUTE_NAME_PATTERN,
  S3_MAX_FILE_FIELD_BYTES,
  S3_MAX_METADATA_ENTRIES,
  S3_MAX_PART_NUMBER,
  UPLOAD_TICKET_MAX_LENGTH,
} from "@/limits";

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

/** No control characters and no lone surrogates, which no header can carry. */
function isPrintable(value: string): boolean {
  return value.isWellFormed() && !CONTROL_CHARACTER.test(value);
}

/**
 * File name on the wire. Trimmed, 1 to 255 UTF-8 bytes, valid Unicode, no
 * control characters, and no bidi controls, which would let `x{U+202E}fdp.exe`
 * display as `xexe.pdf`. They also bound the upload ticket size.
 */
export const fileNameSchema = trimmedString
  .refine(fitsFileField, {
    message: `File name exceeds ${S3_MAX_FILE_FIELD_BYTES} bytes`,
  })
  .refine(isPrintable, {
    message: "File name contains control characters",
  })
  .refine((value) => !BIDI_CONTROL.test(value), {
    message: "File name contains bidi control characters",
  });

/** MIME type on the wire. Trimmed, at most 255 UTF-8 bytes, no control characters. */
export const contentTypeSchema = z
  .string()
  .trim()
  .refine(fitsFileField, {
    message: `Content type exceeds ${S3_MAX_FILE_FIELD_BYTES} bytes`,
  })
  .refine(isPrintable, {
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
export const uploadTicketSchema = trimmedString.max(UPLOAD_TICKET_MAX_LENGTH);

export const routeNameSchema = trimmedString.regex(
  ROUTE_NAME_PATTERN,
  "Invalid route name",
);

/**
 * Stored object key: normalized, at most 1024 UTF-8 bytes, no `.` / `..` /
 * empty segments, control characters or backslashes. It is not trimmed: a
 * key with whitespace around it is refused, since S3 would treat it as
 * another object.
 */
export const objectKeySchema = z.string().transform((value, ctx) => {
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
 * S3 `ChecksumSHA256`: a 32-byte SHA-256 as standard base64. Padding is
 * optional on input, and the output always has it, so every provider gets
 * the canonical form `sha256Blob` would send padded.
 */
export const sha256ChecksumSchema = z
  .stringFormat("sha256-base64", /^[A-Z0-9+/]{43}=?$/i)
  .transform((value) => (value.length === 43 ? `${value}=` : value));

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
