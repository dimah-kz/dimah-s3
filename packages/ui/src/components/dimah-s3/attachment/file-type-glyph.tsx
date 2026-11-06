"use client";

import { FileIcon, defaultStyles } from "react-file-icon";
import type { DefaultExtensionType, FileIconProps } from "react-file-icon";
import { cn } from "cn";

/** Extensions `react-file-icon` styles under another key. */
const STYLE_ALIASES: Readonly<Record<string, DefaultExtensionType>> = {
  "7z": "7zip",
  jpe: "jpg",
  markdown: "md",
  yaml: "yml",
};

/** Extensions for MIME types, used when the name has no extension. */
const MIME_TO_EXT: Readonly<Record<string, string>> = {
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
  "audio/flac": "flac",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "video/x-matroska": "mkv",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/svg+xml": "svg",
  "image/heic": "heic",
  "image/tiff": "tiff",
  "application/json": "json",
  "text/javascript": "js",
  "application/javascript": "js",
  "text/html": "html",
  "text/css": "css",
  "text/plain": "txt",
  "text/markdown": "md",
};

/** A glyph style for a MIME family, for types `react-file-icon` has no key for. */
function familyStyle(mime: string): Partial<FileIconProps> | null {
  if (mime.startsWith("image/")) return { type: "image" };
  if (mime.startsWith("audio/")) return { type: "audio" };
  if (mime.startsWith("video/")) return { type: "video" };
  if (mime.startsWith("font/")) return { type: "font" };
  if (mime.startsWith("text/")) return { type: "document" };
  return null;
}

function extensionOf(fileName: string): string | null {
  const base = fileName.split(/[/\\]/).pop() ?? fileName;
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return null;
  return base.slice(dot + 1).toLowerCase();
}

function stylesOf(ext: string): Partial<FileIconProps> | null {
  return (
    defaultStyles[(STYLE_ALIASES[ext] ?? ext) as DefaultExtensionType] ?? null
  );
}

/** What {@link FileTypeGlyph} draws for a file. @internal */
export type FileTypeGlyphStyle = {
  /** The label on the glyph, or `null` for none. */
  label: string | null;
  styles: Partial<FileIconProps>;
};

/**
 * The glyph for a file. A known content type picks the style and label,
 * else the file's own extension does. A type with no glyph of its own uses
 * its family's (`image/*`), and anything else a plain document. The label
 * is never another type's: `song.flac` reads `flac`.
 * @internal
 */
export function resolveFileTypeGlyph(
  fileName: string,
  contentType?: string | null,
): FileTypeGlyphStyle {
  const mime = contentType?.trim().toLowerCase() ?? "";
  const ext = extensionOf(fileName);
  const mimeExt = MIME_TO_EXT[mime] ?? null;
  const styles = (mimeExt ? stylesOf(mimeExt) : null) ??
    (ext ? stylesOf(ext) : null) ??
    familyStyle(mime) ?? { type: "document" };
  return { label: mimeExt ?? ext, styles };
}

export type FileTypeGlyphProps = {
  fileName: string;
  /** MIME type. It wins over the file extension when it is known. */
  contentType?: string | null;
  /**
   * `fill` tracks a parent media box (attachments).
   * `icon` is a fixed file-list glyph with no plate behind it.
   * @default "fill"
   */
  layout?: "fill" | "icon";
  className?: string;
};

/**
 * Colored file glyph for attachment media (no image preview), drawn by
 * `react-file-icon` and labelled with the file's extension.
 */
export function FileTypeGlyph({
  fileName,
  contentType,
  layout = "fill",
  className,
}: FileTypeGlyphProps) {
  const { label, styles } = resolveFileTypeGlyph(fileName, contentType);

  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center",
        layout === "fill"
          ? "size-full [&_svg]:size-[min(76%,8rem)]!"
          : "size-8 [&_svg]:size-7!",
        className,
      )}
      aria-hidden
    >
      <FileIcon extension={label ?? undefined} {...styles} />
    </span>
  );
}
