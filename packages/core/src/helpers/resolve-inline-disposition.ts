import type { ContentDispositionType } from "./build-content-disposition";
import { baseType, effectiveContentType } from "./content-type";

/**
 * Types that open in the browser by default: raster images, PDF, audio,
 * video, and plain text. Never HTML, SVG, or other active content.
 */
export const DEFAULT_INLINE_TYPES: readonly string[] = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/bmp",
  "application/pdf",
  "audio/*",
  "video/*",
  "text/plain",
];

/**
 * Types that run as a page in the browser: HTML, any XML (SVG, XHTML, XSL),
 * and JavaScript. Only an exact entry in the allow list renders them inline.
 */
function isActiveContentType(type: string): boolean {
  return (
    type === "text/html" ||
    type === "text/xsl" ||
    type.endsWith("/xml") ||
    type.endsWith("+xml") ||
    type.includes("javascript") ||
    type.includes("ecmascript")
  );
}

function isAllowed(type: string, allow: readonly string[]): boolean {
  const active = isActiveContentType(type);
  return allow.some((entry) => {
    const token = entry.trim().toLowerCase();
    if (token === type) return true;
    if (active || !token.endsWith("/*")) return false;
    return type.startsWith(token.slice(0, -1));
  });
}

/** Input for {@link resolveInlineDisposition}. */
export type ResolveInlineDispositionInput = {
  /** Stored type, such as HeadObject `ContentType`. */
  contentType?: string;
  /**
   * Used for the type when `contentType` is missing, empty,
   * `application/octet-stream` or `binary/octet-stream`.
   */
  fileName?: string;
  /**
   * MIME types, or `type/*` wildcards, that may open in the browser.
   * File extensions are not accepted: the name does not decide what renders.
   * A wildcard never matches HTML, XML (including `image/svg+xml` and
   * `text/xsl`), or JavaScript; list those types exactly to allow them.
   * Omitted: {@link DEFAULT_INLINE_TYPES}. `false`: never inline.
   */
  allow?: readonly string[] | false;
  /** Client request or route default. */
  requested?: ContentDispositionType;
};

/** Result of {@link resolveInlineDisposition}. */
export type ResolveInlineDispositionResult = {
  disposition: ContentDispositionType;
  /**
   * Set when inline is allowed but the object has no usable stored type:
   * the type matched from the file name. Sign it as `ResponseContentType`
   * so the browser renders the object.
   */
  contentType?: string;
};

/**
 * Whether an object may open in the browser. `inline` is kept only when the
 * object's type is on `allow`; anything else is signed as `attachment`.
 * The server runs this on presign and `/file` with the route's inline list,
 * and a client can call it with the catalog `inlineTypes` to choose Preview
 * or Download.
 */
export function resolveInlineDisposition(
  input: ResolveInlineDispositionInput,
): ResolveInlineDispositionResult {
  const allow = input.allow ?? DEFAULT_INLINE_TYPES;
  if (input.requested !== "inline" || allow === false) {
    return { disposition: "attachment" };
  }
  const type = effectiveContentType(input.contentType, input.fileName);
  if (!type || !isAllowed(type, allow)) {
    return { disposition: "attachment" };
  }
  // A type other than the stored one came from the file name.
  return type === baseType(input.contentType)
    ? { disposition: "inline" }
    : { disposition: "inline", contentType: type };
}
