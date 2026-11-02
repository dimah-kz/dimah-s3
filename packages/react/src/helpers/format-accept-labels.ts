/** Options for {@link formatAcceptLabels}. */
export type FormatAcceptLabelsOptions = {
  /**
   * Labels for `type/*` wildcards by top-level type, such as
   * `{ image: "Bilder" }`. Missing types use the English defaults.
   */
  groups?: Readonly<Partial<Record<string, string>>>;
};

const GROUPS: Readonly<Record<string, string>> = {
  image: "Images",
  video: "Videos",
  audio: "Audio",
  text: "Text files",
  font: "Fonts",
};

/** MIME types whose subtype does not read as a file type. */
const MIME_LABELS: Readonly<Record<string, string>> = {
  "application/msword": "DOC",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "DOCX",
  "application/vnd.ms-excel": "XLS",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
  "application/vnd.ms-powerpoint": "PPT",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    "PPTX",
  "application/vnd.oasis.opendocument.text": "ODT",
  "application/vnd.oasis.opendocument.spreadsheet": "ODS",
  "application/vnd.oasis.opendocument.presentation": "ODP",
  "application/x-zip-compressed": "ZIP",
  "application/x-7z-compressed": "7Z",
  "application/x-rar-compressed": "RAR",
  "audio/mpeg": "MP3",
  "text/plain": "TXT",
  "text/markdown": "MD",
  "video/quicktime": "MOV",
  "video/x-matroska": "MKV",
};

function formatAcceptLabel(
  token: string,
  groups: FormatAcceptLabelsOptions["groups"],
): string | null {
  const type = token.trim().toLowerCase();
  if (!type || type === "*" || type === "*/*") return null;
  if (type.startsWith(".")) {
    const ext = type.slice(1);
    return ext === "jpg" || ext === "jpeg" ? "JPEG" : ext.toUpperCase();
  }
  const [base = "", sub = ""] = type.split("/");
  if (sub === "*") {
    return (
      groups?.[base] ??
      GROUPS[base] ??
      `${base.charAt(0).toUpperCase()}${base.slice(1)} files`
    );
  }
  const known = MIME_LABELS[type];
  if (known) return known;
  // `x-tar` → TAR, `vnd.rar` → RAR, `svg+xml` → SVG.
  const name = sub.replace(/^(?:x-|vnd\.)/, "").replace(/\+.*$/, "");
  return name ? name.toUpperCase() : token.trim();
}

/**
 * Short display labels for HTML `accept` tokens, in order and without
 * duplicates: `.jpeg` → `JPEG`, `image/*` → `Images`, a DOCX MIME type →
 * `DOCX`. A wildcard for any type has no label. In components,
 * `useFormatAcceptLabels()` translates the group labels for you.
 */
export function formatAcceptLabels(
  accept?: readonly string[],
  options: FormatAcceptLabelsOptions = {},
): string[] {
  if (!accept?.length) return [];
  const labels = new Set<string>();
  for (const token of accept) {
    const label = formatAcceptLabel(token, options.groups);
    if (label) labels.add(label);
  }
  return [...labels];
}
