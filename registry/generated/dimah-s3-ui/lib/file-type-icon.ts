import type { LucideIcon } from "lucide-react";
import {
  FileArchiveIcon,
  FileAudioIcon,
  FileCodeIcon,
  FileIcon,
  FileImageIcon,
  FileJsonIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FileVideoIcon,
} from "lucide-react";

/**
 * Exactly 30 popular extensions → lucide file icons.
 * Do not grow past 30 — unknown types use {@link FileIcon} / MIME fallbacks.
 */
const EXT_ENTRIES = [
  // documents (4)
  ["pdf", FileTextIcon],
  ["doc", FileTextIcon],
  ["docx", FileTextIcon],
  ["txt", FileTextIcon],
  // sheets / slides (5)
  ["xls", FileSpreadsheetIcon],
  ["xlsx", FileSpreadsheetIcon],
  ["csv", FileSpreadsheetIcon],
  ["ppt", FileTextIcon],
  ["pptx", FileTextIcon],
  // archives (5)
  ["zip", FileArchiveIcon],
  ["rar", FileArchiveIcon],
  ["7z", FileArchiveIcon],
  ["tar", FileArchiveIcon],
  ["gz", FileArchiveIcon],
  // audio (3)
  ["mp3", FileAudioIcon],
  ["wav", FileAudioIcon],
  ["m4a", FileAudioIcon],
  // video (5)
  ["mp4", FileVideoIcon],
  ["mov", FileVideoIcon],
  ["webm", FileVideoIcon],
  ["mkv", FileVideoIcon],
  ["avi", FileVideoIcon],
  // images when no previewUrl (6)
  ["png", FileImageIcon],
  ["jpg", FileImageIcon],
  ["jpeg", FileImageIcon],
  ["gif", FileImageIcon],
  ["webp", FileImageIcon],
  ["svg", FileImageIcon],
  // data (2)
  ["json", FileJsonIcon],
  ["xml", FileCodeIcon],
] as const satisfies ReadonlyArray<readonly [string, LucideIcon]>;

/** Compile-time guard: keep the popular extension list at exactly 30. */
type AssertExactly30 = (typeof EXT_ENTRIES)["length"] extends 30
  ? true
  : never;
const _exactly30: AssertExactly30 = true;
void _exactly30;

const EXT_ICONS: Record<string, LucideIcon> = Object.fromEntries(EXT_ENTRIES);

function extensionOf(fileName: string): string {
  const base = fileName.split(/[/\\]/).pop() ?? fileName;
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return "";
  return base.slice(dot + 1).toLowerCase();
}

/**
 * Resolve a lucide file icon for a display name + optional MIME type.
 * Prefer the capped extension map; then MIME family; else generic file.
 */
export function resolveFileTypeIcon(
  fileName: string,
  fileType?: string | null,
): LucideIcon {
  const ext = extensionOf(fileName);
  const byExt = ext ? EXT_ICONS[ext] : undefined;
  if (byExt) return byExt;

  const mime = (fileType ?? "").toLowerCase();
  if (mime.startsWith("image/")) return FileImageIcon;
  if (mime.startsWith("audio/")) return FileAudioIcon;
  if (mime.startsWith("video/")) return FileVideoIcon;
  if (mime === "application/pdf") return FileTextIcon;
  if (
    mime === "application/zip" ||
    mime === "application/x-zip-compressed" ||
    mime === "application/x-7z-compressed" ||
    mime.includes("compressed") ||
    mime.includes("tar")
  ) {
    return FileArchiveIcon;
  }
  if (
    mime.includes("spreadsheet") ||
    mime.includes("excel") ||
    mime === "text/csv"
  ) {
    return FileSpreadsheetIcon;
  }
  if (mime.includes("json")) return FileJsonIcon;
  if (
    mime.startsWith("text/") ||
    mime.includes("msword") ||
    mime.includes("document") ||
    mime.includes("presentation") ||
    mime.includes("powerpoint")
  ) {
    return FileTextIcon;
  }

  return FileIcon;
}
