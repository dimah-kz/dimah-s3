import type { Accept } from "react-dropzone";

/**
 * Extension → MIME for dropzone's `{ [mime]: extensions }` map.
 *
 * react-dropzone (and Chromium's file picker) warn and drop keys that are not
 * valid MIME types (the catch-all star type is not). Pairing a real type also
 * lets drag-over match by MIME when the browser has not exposed the filename
 * yet.
 */
const EXTENSION_MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".avif": "image/avif",
  ".heic": "image/heic",
  ".bmp": "image/bmp",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".json": "application/json",
  ".md": "text/markdown",
  ".html": "text/html",
  ".htm": "text/html",
  ".css": "text/css",
  ".zip": "application/zip",
  ".doc": "application/msword",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx":
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

/** Family wildcards react-dropzone treats as valid MIME keys (same as HTML `accept`). */
const FAMILY_WILDCARDS = new Set([
  "audio/*",
  "video/*",
  "image/*",
  "text/*",
  "application/*",
]);

function isDropzoneMimeKey(value: string): boolean {
  if (FAMILY_WILDCARDS.has(value)) return true;
  // Anchored; react-dropzone's copy of this check uses `/g` and is not `^$`.
  return /^\w+\/[-+.\w]+$/.test(value);
}

function mimeForExtension(ext: string): string | undefined {
  const mime = EXTENSION_MIME[ext] ?? `application/x-${ext.slice(1)}`;
  return isDropzoneMimeKey(mime) ? mime : undefined;
}

/**
 * Convert dimah-s3 `accept: string[]` into react-dropzone's `Accept` map.
 *
 * - MIME types / wildcards (`image/*`, `application/pdf`) become keys.
 * - Bare extensions (`.png`, `pdf`) are grouped under their MIME type so
 *   dropzone can match by type or filename. Invalid keys such as the
 *   catch-all star type are omitted (they are not valid MIME types for the
 *   picker).
 *
 * Family wildcards keep an empty extension list so the native `accept`
 * attribute can stay `image/*` (pairing extensions would make react-dropzone
 * drop the wildcard from the input).
 *
 * @example
 * ```ts
 * toDropzoneAccept(["image/*", ".pdf"])
 * // → { "image/*": [], "application/pdf": [".pdf"] }
 * ```
 */
export function toDropzoneAccept(
  accept: string[] | undefined,
): Accept | undefined {
  if (accept == null || accept.length === 0) return undefined;

  const map: Record<string, string[]> = {};

  for (const raw of accept) {
    const item = raw.trim().toLowerCase();
    if (!item) continue;

    if (item.includes("/")) {
      if (isDropzoneMimeKey(item)) map[item] ??= [];
      continue;
    }

    const ext = item.startsWith(".") ? item : `.${item}`;
    if (!/^\.[\w]+$/.test(ext)) continue;

    const mime = mimeForExtension(ext);
    if (!mime) continue;
    map[mime] ??= [];
    if (!map[mime].includes(ext)) map[mime].push(ext);
  }

  return Object.keys(map).length > 0 ? map : undefined;
}
