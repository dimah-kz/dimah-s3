import type { ContentDispositionType } from "./build-content-disposition";

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

/** Types a browser can render from a name alone, for objects stored without a type. */
const TYPE_BY_EXTENSION: Readonly<Record<string, string>> = {
  avif: "image/avif",
  bmp: "image/bmp",
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  svg: "image/svg+xml",
  webp: "image/webp",
  pdf: "application/pdf",
  json: "application/json",
  csv: "text/csv",
  txt: "text/plain",
  htm: "text/html",
  html: "text/html",
  xhtml: "application/xhtml+xml",
  xml: "application/xml",
  js: "text/javascript",
  mjs: "text/javascript",
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  oga: "audio/ogg",
  ogg: "audio/ogg",
  wav: "audio/wav",
  weba: "audio/webm",
  mov: "video/quicktime",
  mp4: "video/mp4",
  ogv: "video/ogg",
  webm: "video/webm",
};

/** Types without a real value: fall back to the file name. */
const UNTYPED = new Set([
  "",
  "application/octet-stream",
  "binary/octet-stream",
]);

function baseType(contentType: string | undefined): string {
  const [type = ""] = (contentType ?? "").split(";", 1);
  return type.trim().toLowerCase();
}

function typeFromFileName(fileName: string | undefined): string | undefined {
  const dot = fileName?.lastIndexOf(".") ?? -1;
  if (!fileName || dot < 0) return undefined;
  return TYPE_BY_EXTENSION[fileName.slice(dot + 1).toLowerCase()];
}

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
  /** Used for the type when `contentType` is missing or `application/octet-stream`. */
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
  const stored = baseType(input.contentType);
  const untyped = UNTYPED.has(stored);
  const type = untyped ? typeFromFileName(input.fileName) : stored;
  if (!type || !isAllowed(type, allow)) {
    return { disposition: "attachment" };
  }
  return untyped
    ? { disposition: "inline", contentType: type }
    : { disposition: "inline" };
}
