import type { Accept } from "react-dropzone";

/**
 * Convert dimah-s3 `accept: string[]` into react-dropzone's `Accept` map.
 *
 * - MIME types / wildcards (`image/*`, `application/pdf`) become keys.
 * - Bare extensions (`.png`, `pdf`) are grouped under a catch-all MIME key
 *   (`"*" + "/*"`) so dropzone can still match by filename extension.
 *
 * @example
 * ```ts
 * toDropzoneAccept(["image/*", ".pdf"])
 * // → { "image/*": [], "*\/\*": [".pdf"] }  (catch-all MIME key)
 * ```
 */
export function toDropzoneAccept(
  accept: string[] | undefined,
): Accept | undefined {
  if (accept == null || accept.length === 0) return undefined;

  const map: Record<string, string[]> = {};
  const anyMime = "*/*";

  for (const raw of accept) {
    const item = raw.trim();
    if (!item) continue;

    if (item.includes("/")) {
      map[item] ??= [];
      continue;
    }

    const ext = item.startsWith(".")
      ? item.toLowerCase()
      : `.${item.toLowerCase()}`;
    map[anyMime] ??= [];
    if (!map[anyMime].includes(ext)) map[anyMime].push(ext);
  }

  return Object.keys(map).length > 0 ? map : undefined;
}
