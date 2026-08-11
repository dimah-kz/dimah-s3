"use client";

import { FileIcon, defaultStyles } from "react-file-icon";
import type { DefaultExtensionType, FileIconProps } from "react-file-icon";
import { cn } from "@/lib/utils";

/**
 * Curated extensions with colored glyphs via `react-file-icon`.
 * Keep this list lean — duplicates and rare types belong in aliases / MIME
 * family fallbacks, not here. Unknown types use a neutral generic file icon.
 */
const CURATED_EXTS = [
  // documents
  "pdf",
  "doc",
  "docx",
  "txt",
  "md",
  // sheets / slides
  "xls",
  "xlsx",
  "csv",
  "ppt",
  "pptx",
  // archives
  "zip",
  "rar",
  "7z",
  "tar",
  "gz",
  // audio / video
  "mp3",
  "wav",
  "m4a",
  "mp4",
  "mov",
  "webm",
  "mkv",
  // images
  "png",
  "jpg",
  "gif",
  "webp",
  "svg",
  "heic",
  // code / data
  "json",
  "js",
  "ts",
  "jsx",
  "html",
  "css",
] as const;

type CuratedExt = (typeof CURATED_EXTS)[number];

const CURATED = new Set<string>(CURATED_EXTS);

/**
 * Map alternate extensions onto a curated key (same glyph, no list bloat).
 * Also remaps `defaultStyles` keys that differ from the real extension.
 */
const EXT_ALIASES: Record<string, CuratedExt | DefaultExtensionType> = {
  jpeg: "jpg",
  jpe: "jpg",
  "7zip": "7z",
  m4v: "mp4",
  aac: "m4a",
  flac: "mp3",
  ogg: "mp3",
  avi: "mp4",
  bmp: "png",
  tif: "png",
  tiff: "png",
};

/** `defaultStyles` lookup when the curated key differs from the library key. */
const STYLE_ALIASES: Record<string, DefaultExtensionType> = {
  "7z": "7zip",
};

const MIME_TO_EXT: Record<string, CuratedExt> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "text/csv": "csv",
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
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/mp4": "m4a",
  "audio/aac": "m4a",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "video/x-matroska": "mkv",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/heic": "heic",
  "application/json": "json",
  "text/javascript": "js",
  "application/javascript": "js",
  "text/typescript": "ts",
  "application/typescript": "ts",
  "text/jsx": "jsx",
  "text/html": "html",
  "text/css": "css",
  "text/plain": "txt",
  "text/markdown": "md",
};

function extensionOf(fileName: string): string | null {
  const base = fileName.split(/[/\\]/).pop() ?? fileName;
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return null;
  return base.slice(dot + 1).toLowerCase();
}

function mimeFamilyExt(mime: string): CuratedExt | null {
  if (mime.startsWith("image/")) return "png";
  if (mime.startsWith("audio/")) return "mp3";
  if (mime.startsWith("video/")) return "mp4";
  if (mime.startsWith("text/")) return "txt";
  return null;
}

function normalizeExt(ext: string): CuratedExt | null {
  if (CURATED.has(ext)) return ext as CuratedExt;
  const aliased = EXT_ALIASES[ext];
  if (aliased && CURATED.has(aliased)) return aliased as CuratedExt;
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
    if (fromMime) return fromMime;
    const family = mimeFamilyExt(mime);
    if (family) return family;
  }

  const ext = extensionOf(fileName);
  if (!ext) return null;
  return normalizeExt(ext);
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
 * Uses `react-file-icon` + a lean curated extension map.
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
        "flex size-full items-center justify-center [&_svg]:size-[1.4rem]!",
        className,
      )}
      aria-hidden
    >
      <FileIcon extension={label} {...styles} />
    </span>
  );
}
