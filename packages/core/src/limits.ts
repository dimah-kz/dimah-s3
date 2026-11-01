/*
 * Protocol and S3 limits. Plain values with no Zod import, so the browser
 * entry can use them without pulling in the schemas
 * (`@dimah-s3/core/schema`).
 */

/** Fallback when the route omits `expiresIn`. */
export const S3_DEFAULT_EXPIRES_IN = 600;

/** AWS SigV4 presign maximum (7 days), in seconds. */
export const S3_MAX_EXPIRES_IN = 604_800;

/** Most S3 takes in one POST or PutObject (5 GiB), in bytes. */
export const S3_MAX_POST_OBJECT_BYTES = 5 * 1024 * 1024 * 1024;

/** S3 multipart part number maximum. */
export const S3_MAX_PART_NUMBER = 10_000;

/** S3 multipart part minimum (5 MiB). Only the last part may be smaller. */
export const S3_MIN_PART_SIZE = 5 * 1024 * 1024;

/** S3 multipart part maximum (5 GiB). */
export const S3_MAX_PART_SIZE = 5 * 1024 * 1024 * 1024;

/** Preferred part size when the route sets no `multipart.partSize` (8 MiB). */
export const S3_DEFAULT_PART_SIZE = 8 * 1024 * 1024;

/**
 * Largest object (5 TiB), in bytes. AWS allows more since 2025, but 5 TiB
 * is the limit S3-compatible providers share.
 */
export const S3_MAX_OBJECT_SIZE = 5 * 1024 ** 4;

/** Wire limit for `name` and `type`, in UTF-8 bytes. */
export const S3_MAX_FILE_FIELD_BYTES = 255;

/** Upload ticket maximum, in characters. */
export const UPLOAD_TICKET_MAX_LENGTH = 8192;

/** Max user-defined metadata entries on an upload body. */
export const S3_MAX_METADATA_ENTRIES = 32;

/** Most keys one `deleteMany` request may carry. */
export const DELETE_MANY_MAX_KEYS = 100;

/** Named file-route identifier (`avatars`, `uploads`, …). */
export const ROUTE_NAME_PATTERN = /^[a-z][\w-]{0,63}$/i;
