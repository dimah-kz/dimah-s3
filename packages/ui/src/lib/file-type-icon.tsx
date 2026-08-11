"use client";

import { FileIcon, defaultStyles } from "react-file-icon";
import type { DefaultExtensionType, FileIconProps } from "react-file-icon";
import { cn } from "@/lib/utils";

/**
 * Exactly 50 popular extensions with colored glyphs via `react-file-icon`.
 * Do not grow past 50 — unknown types use a neutral generic file icon.
 */
const CURATED_EXTS = [
  // documents (6)
  "pdf",
  "doc",
  "docx",
  "txt",
  "md",
  "rtf",
  // sheets (4)
  "xls",
  "xlsx",
  "csv",
  "ods",
  // slides (2)
  "ppt",
  "pptx",
  // archives (6)
  "zip",
  "rar",
  "7z",
  "tar",
  "gz",
  "dmg",
  // audio (6)
  "mp3",
  "wav",
  "flac",
  "m4a",
  "aac",
  "ogg",
  // video (6)
  "mp4",
  "mov",
  "webm",
  "mkv",
  "avi",
  "m4v",
  // images / design (10)
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "bmp",
  "heic",
  "psd",
  "ai",
  // code / data (10)
  "json",
  "js",
  "ts",
  "jsx",
  "html",
  "css",
  "xml",
  "py",
  "php",
  "yml",
] as const;

/** Compile-time guard: keep the curated list at exactly 50. */
type AssertExactly50 = (typeof CURATED_EXTS)["length"] extends 50
  ? true
  : never;
const _exactly50: AssertExactly50 = true;
void _exactly50;

const CURATED = new Set<string>(CURATED_EXTS);

/** Alias map when `defaultStyles` key differs from the real extension. */
const STYLE_ALIASES: Record<string, DefaultExtensionType> = {
  "7z": "7zip",
};

const MIME_TO_EXT: Record<string, (typeof CURATED_EXTS)[number]> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "text/csv": "csv",
  "application/vnd.oasis.opendocument.spreadsheet": "ods",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    "pptx",
  "application/zip": "zip",
  "application/x-zip-compressed": "zip",
  "application/x-rar-compressed": "rar",
  "application/vnd.rar": "rar",
  "application/x-7z-compressed": "7z",
  "application/x-tar": "tar",
  "application/gzip": "gz",
  "application/x-apple-diskimage": "dmg",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/flac": "flac",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/ogg": "ogg",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "video/x-matroska": "mkv",
  "video/x-msvideo": "avi",
  "video/x-m4v": "m4v",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/bmp": "bmp",
  "image/heic": "heic",
  "image/vnd.adobe.photoshop": "psd",
  "application/postscript": "ai",
  "application/json": "json",
  "text/javascript": "js",
  "application/javascript": "js",
  "text/typescript": "ts",
  "application/typescript": "ts",
  "text/jsx": "jsx",
  "text/html": "html",
  "text/css": "css",
  "application/xml": "xml",
  "text/xml": "xml",
  "text/x-python": "py",
  "application/x-python": "py",
  "application/x-httpd-php": "php",
  "text/yaml": "yml",
  "application/x-yaml": "yml",
  "text/plain": "txt",
  "text/markdown": "md",
  "application/rtf": "rtf",
  "text/rtf": "rtf",
};

function extensionOf(fileName: string): string | null {
  const base = fileName.split(/[/\\]/).pop() ?? fileName;
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return null;
  return base.slice(dot + 1).toLowerCase();
}

function mimeFamilyExt(mime: string): (typeof CURATED_EXTS)[number] | null {
  if (mime.startsWith("image/")) return "png";
  if (mime.startsWith("audio/")) return "mp3";
  if (mime.startsWith("video/")) return "mp4";
  if (mime.startsWith("text/")) return "txt";
  return null;
}

/** Resolve a curated extension key for icon styling (or `null` if unknown). */
export function resolveFileTypeExtension(
  fileName: string,
  mimeType?: string | null,
): string | null {
  const mime = mimeType?.trim().toLowerCase();
  if (mime) {
    const fromMime = MIME_TO_EXT[mime];
    if (fromMime && CURATED.has(fromMime)) return fromMime;
    const family = mimeFamilyExt(mime);
    if (family) return family;
  }

  const ext = extensionOf(fileName);
  if (ext && CURATED.has(ext)) return ext;
  return null;
}

function stylesFor(ext: string): Partial<FileIconProps> {
  const key = (STYLE_ALIASES[ext] ?? ext) as DefaultExtensionType;
  const fromDefaults = defaultStyles[key];
  if (fromDefaults) return fromDefaults;
  // `heic` may be missing from older @types; keep a sensible image style.
  if (ext === "heic") return { type: "image" };
  if (ext === "7z") return { type: "compressed" };
  return {};
}

export type FileTypeGlyphProps = {
  fileName: string;
  fileType?: string | null;
  className?: string;
};

/**
 * Colored file glyph for attachment media (no image preview).
 * Uses `react-file-icon` + a capped map of the 50 most common extensions.
 */
export function FileTypeGlyph({
  fileName,
  fileType,
  className,
}: FileTypeGlyphProps) {
  const ext = resolveFileTypeExtension(fileName, fileType);
  const label = ext ?? extensionOf(fileName) ?? undefined;
  const styles = ext ? stylesFor(ext) : { type: "document" as const };

  return (
    <span
      className={cn(
        // AttachmentMedia defaults bare SVGs to size-4; scale the glyph up
        // inside the existing media box without changing the slot.
        "flex size-full items-center justify-center [&_svg]:size-[1.375rem]!",
        className,
      )}
      aria-hidden
    >
      <FileIcon extension={label} {...styles} />
    </span>
  );
}
