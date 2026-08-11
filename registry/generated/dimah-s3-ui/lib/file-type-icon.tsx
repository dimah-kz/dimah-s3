import type { LucideIcon } from "lucide-react";
import {
  FileArchiveIcon,
  FileAudioIcon,
  FileCodeIcon,
  FileIcon,
  FileJsonIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FileVideoIcon,
} from "lucide-react";

/**
 * Curated extension → icon map (hard cap: 30).
 * Prefer MIME when available; fall back to extension, then FileIcon.
 */
const FILE_TYPE_ICONS = {
  // documents
  pdf: FileTextIcon,
  doc: FileTextIcon,
  docx: FileTextIcon,
  txt: FileTextIcon,
  md: FileTextIcon,
  // spreadsheets
  xls: FileSpreadsheetIcon,
  xlsx: FileSpreadsheetIcon,
  csv: FileSpreadsheetIcon,
  // presentations
  ppt: FileTextIcon,
  pptx: FileTextIcon,
  // archives
  zip: FileArchiveIcon,
  rar: FileArchiveIcon,
  "7z": FileArchiveIcon,
  tar: FileArchiveIcon,
  gz: FileArchiveIcon,
  // audio
  mp3: FileAudioIcon,
  wav: FileAudioIcon,
  flac: FileAudioIcon,
  m4a: FileAudioIcon,
  // video
  mp4: FileVideoIcon,
  mov: FileVideoIcon,
  webm: FileVideoIcon,
  mkv: FileVideoIcon,
  avi: FileVideoIcon,
  // code / data
  json: FileJsonIcon,
  js: FileCodeIcon,
  ts: FileCodeIcon,
  html: FileCodeIcon,
  css: FileCodeIcon,
  xml: FileCodeIcon,
} as const satisfies Record<string, LucideIcon>;

type KnownExt = keyof typeof FILE_TYPE_ICONS;

const KNOWN_EXTS = Object.keys(FILE_TYPE_ICONS) as KnownExt[];

if (KNOWN_EXTS.length > 30) {
  throw new Error(
    `[dimah-s3/ui] FILE_TYPE_ICONS has ${KNOWN_EXTS.length} entries; max is 30`,
  );
}

const MIME_TO_EXT: Record<string, KnownExt> = {
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
  "audio/mp4": "m4a",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "video/x-matroska": "mkv",
  "video/x-msvideo": "avi",
  "application/json": "json",
  "text/javascript": "js",
  "application/javascript": "js",
  "text/html": "html",
  "text/css": "css",
  "application/xml": "xml",
  "text/xml": "xml",
  "text/plain": "txt",
  "text/markdown": "md",
};

function extensionOf(fileName: string): string | null {
  const base = fileName.split(/[/\\]/).pop() ?? fileName;
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return null;
  return base.slice(dot + 1).toLowerCase();
}

/** Resolve a Lucide file-type icon for upload status media (≤30 curated types). */
export function resolveFileTypeIcon(
  fileName: string,
  mimeType?: string | null,
): LucideIcon {
  const mime = mimeType?.trim().toLowerCase();
  if (mime) {
    const fromMime = MIME_TO_EXT[mime];
    if (fromMime) return FILE_TYPE_ICONS[fromMime];
    if (mime.startsWith("audio/")) return FileAudioIcon;
    if (mime.startsWith("video/")) return FileVideoIcon;
    if (mime.startsWith("text/")) return FileTextIcon;
  }

  const ext = extensionOf(fileName);
  if (ext && ext in FILE_TYPE_ICONS) {
    return FILE_TYPE_ICONS[ext as KnownExt];
  }

  return FileIcon;
}
