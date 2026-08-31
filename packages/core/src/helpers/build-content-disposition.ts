export type ContentDispositionType = "inline" | "attachment";

/**
 * Builds a RFC 6266 `Content-Disposition` value.
 *
 * Includes both the ASCII-safe `filename` fallback and the RFC 5987
 * `filename*` parameter for full Unicode support.
 */
export function buildContentDisposition(
  fileName: string,
  type: ContentDispositionType = "attachment",
): string {
  const ascii = fileName.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(fileName);
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
