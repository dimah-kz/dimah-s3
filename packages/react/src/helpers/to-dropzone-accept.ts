import type { Accept } from "react-dropzone";

/**
 * Common IANA media types for filename extensions.
 * @see https://www.iana.org/assignments/media-types/media-types.xhtml
 * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/MIME_types/Common_types
 */
const EXTENSION_MIME: Record<string, string> = {
  ".aac": "audio/aac",
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".css": "text/css",
  ".csv": "text/csv",
  ".doc": "application/msword",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".gif": "image/gif",
  ".heic": "image/heic",
  ".htm": "text/html",
  ".html": "text/html",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".json": "application/json",
  ".m4a": "audio/mp4",
  ".md": "text/markdown",
  ".mkv": "video/x-matroska",
  ".mov": "video/quicktime",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".ogg": "audio/ogg",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx":
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".svg": "image/svg+xml",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".txt": "text/plain",
  ".wav": "audio/wav",
  ".webm": "video/webm",
  ".webp": "image/webp",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".zip": "application/zip",
};

/** HTML `accept` family wildcards. @see https://html.spec.whatwg.org/multipage/input.html#attr-input-accept */
const FAMILY_WILDCARD = new Set(["audio/*", "image/*", "video/*"]);

/**
 * Whether a token is a MIME-shaped HTML accept specifier: `image|audio|video/*`
 * or a MIME type with no parameters and no wildcards.
 */
function isMimeAcceptToken(token: string): boolean {
  if (FAMILY_WILDCARD.has(token)) return true;
  const slash = token.indexOf("/");
  if (slash < 1) return false;
  const type = token.slice(0, slash);
  const subtype = token.slice(slash + 1);
  return (
    type.length > 0 &&
    subtype.length > 0 &&
    !type.includes("*") &&
    !subtype.includes("*") &&
    !subtype.includes(";")
  );
}

/**
 * Convert dimah-s3 `accept: string[]` (HTML accept tokens) into react-dropzone's
 * `{ [mime]: extensions }` map. Dropzone keys must be MIME types; a catch-all
 * star type is not valid.
 *
 * @internal
 */
export function toDropzoneAccept(
  accept: string[] | undefined,
): Accept | undefined {
  if (accept == null || accept.length === 0) return undefined;

  const map: Record<string, string[]> = {};

  for (const raw of accept) {
    const token = raw.trim().toLowerCase();
    if (!token) continue;

    if (token.startsWith(".")) {
      if (token.length < 2) continue;
      const mime = EXTENSION_MIME[token] ?? "application/octet-stream";
      map[mime] ??= [];
      if (!map[mime].includes(token)) map[mime].push(token);
      continue;
    }

    if (isMimeAcceptToken(token)) map[token] ??= [];
  }

  return Object.keys(map).length > 0 ? map : undefined;
}
