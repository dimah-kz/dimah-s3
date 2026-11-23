export type ContentDispositionType = "inline" | "attachment";

/** RFC 5987 `ext-value` encoding: `encodeURIComponent` plus `'()*`. */
function encodeExtValue(value: string): string {
  return encodeURIComponent(value).replaceAll(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/**
 * Builds a RFC 6266 `Content-Disposition` value: an ASCII `filename`
 * fallback and the RFC 5987 `filename*` with the full UTF-8 name. The
 * fallback replaces non-ASCII, `"`, `\` and `%` with `_`, since some
 * browsers percent-decode `filename`.
 */
export function buildContentDisposition(
  fileName: string,
  type: ContentDispositionType = "attachment",
): string {
  const ascii = fileName.replaceAll(/[^\x20-\x7E]|["\\%]/g, "_");
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeExtValue(fileName)}`;
}
