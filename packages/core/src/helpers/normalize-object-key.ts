import { stripSurroundingSlashes } from "./strip-slashes";

/** S3 object key maximum, in UTF-8 bytes. */
export const S3_MAX_OBJECT_KEY_BYTES = 1024;

const utf8 = new TextEncoder();

/** Length of an object key in UTF-8 bytes, the unit S3 limits keys in. */
export function objectKeyByteLength(key: string): number {
  return utf8.encode(key).byteLength;
}

/**
 * Strip leading/trailing slashes and reject `.` / `..` / empty segments,
 * NUL, backslashes, and keys over {@link S3_MAX_OBJECT_KEY_BYTES}.
 * Returns `null` when the key is unsafe.
 */
export function normalizeObjectKey(key: string): string | null {
  const trimmed = stripSurroundingSlashes(key);
  if (!trimmed) return null;
  // A UTF-8 key is never shorter than its UTF-16 length: skip encoding huge keys.
  if (trimmed.length > S3_MAX_OBJECT_KEY_BYTES) return null;
  if (objectKeyByteLength(trimmed) > S3_MAX_OBJECT_KEY_BYTES) return null;
  if (trimmed.includes("\\") || trimmed.includes("\0")) return null;
  const parts = trimmed.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) {
    return null;
  }
  return parts.join("/");
}
