/** S3 object key maximum (1024 bytes). */
export const S3_MAX_OBJECT_KEY_LENGTH = 1024;

/**
 * Strip leading/trailing slashes and reject `.` / `..` / empty segments,
 * NUL, backslashes, and oversized keys. Returns `null` when the key is unsafe.
 */
export function normalizeObjectKey(key: string): string | null {
  const trimmed = key.replace(/^\/+/u, "").replace(/\/+$/u, "");
  if (!trimmed) return null;
  if (trimmed.length > S3_MAX_OBJECT_KEY_LENGTH) return null;
  if (trimmed.includes("\\") || trimmed.includes("\0")) return null;
  const parts = trimmed.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) {
    return null;
  }
  return parts.join("/");
}
