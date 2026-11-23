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

/** Lower-cased MIME type without parameters (`""` when missing). */
export function baseType(contentType: string | undefined): string {
  const [type = ""] = (contentType ?? "").split(";", 1);
  return type.trim().toLowerCase();
}

function typeFromFileName(fileName: string | undefined): string | undefined {
  const dot = fileName?.lastIndexOf(".") ?? -1;
  if (!fileName || dot < 0) return undefined;
  return TYPE_BY_EXTENSION[fileName.slice(dot + 1).toLowerCase()];
}

/**
 * The type an object is served as: the stored type without parameters,
 * lower-cased, or, when it is missing, empty, `application/octet-stream` or
 * `binary/octet-stream`, the type its file name gives (`x.png` as
 * `image/png`). `undefined` when neither gives a type. Inline display and
 * `verifyContent` both use it.
 */
export function effectiveContentType(
  contentType?: string,
  fileName?: string,
): string | undefined {
  const stored = baseType(contentType);
  return UNTYPED.has(stored) ? typeFromFileName(fileName) : stored;
}

/**
 * The `type` param of `FILE_TYPE_NOT_ALLOWED`: the extension (`.exe`), else
 * the MIME type, else `unknown`. `validateFile` and the server use it, so the
 * browser and server report a refused file the same way.
 */
export function describeFileType(
  fileName: string,
  contentType: string | undefined,
): string {
  const dot = fileName.lastIndexOf(".");
  if (dot >= 0 && dot < fileName.length - 1) return fileName.slice(dot);
  return contentType || "unknown";
}
