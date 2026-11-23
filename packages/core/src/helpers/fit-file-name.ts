import { S3_MAX_FILE_FIELD_BYTES } from "@/limits";

/** Longest extension (with its dot) kept when a name is shortened. */
const MAX_EXTENSION_BYTES = 32;

/** Name used when nothing usable is left. */
const FALLBACK_FILE_NAME = "file";

const CONTROL_CHARACTERS = /\p{Cc}/gu;

/**
 * Bidi embedding, override and isolate controls (U+202A to U+202E, U+2066
 * to U+2069). They can make `x{U+202E}fdp.exe` read as `xexe.pdf`. Other
 * format characters, such as the joiner in emoji, are kept.
 */
export const BIDI_CONTROL = /[\u202A-\u202E\u2066-\u2069]/u;

const BIDI_CONTROLS = new RegExp(BIDI_CONTROL.source, "gu");

const utf8 = new TextEncoder();

function byteLength(text: string): number {
  return utf8.encode(text).byteLength;
}

let graphemeSegmenter: Intl.Segmenter | null | undefined;

/** User-perceived characters when `Intl.Segmenter` exists, else code points. */
function graphemes(text: string): Iterable<string> {
  if (graphemeSegmenter === undefined) {
    graphemeSegmenter =
      typeof Intl.Segmenter === "function"
        ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
        : null;
  }
  if (!graphemeSegmenter) return text;
  return Array.from(graphemeSegmenter.segment(text), (part) => part.segment);
}

/** The longest run of whole `parts` that fits in `maxBytes`. */
function takeWithin(parts: Iterable<string>, maxBytes: number): string {
  let taken = "";
  let used = 0;
  for (const part of parts) {
    used += byteLength(part);
    if (used > maxBytes) break;
    taken += part;
  }
  return taken;
}

/**
 * Cut `text` to `maxBytes` of UTF-8 without splitting a character. Cuts on
 * grapheme boundaries, and on code points when the first grapheme alone is
 * too long.
 */
function cutToBytes(text: string, maxBytes: number): string {
  return takeWithin(graphemes(text), maxBytes) || takeWithin(text, maxBytes);
}

/**
 * Fit a file name to the wire rule for `name`: lone surrogates replaced,
 * control and bidi characters removed, trimmed, and at most
 * {@link S3_MAX_FILE_FIELD_BYTES} UTF-8 bytes. A longer name is cut on a
 * character boundary and keeps a short extension. A name that is already
 * valid comes back unchanged; an empty result is `"file"`.
 */
export function fitFileName(name: string): string {
  const cleaned = name
    .toWellFormed()
    .replaceAll(CONTROL_CHARACTERS, "")
    .replaceAll(BIDI_CONTROLS, "")
    .trim();
  if (byteLength(cleaned) <= S3_MAX_FILE_FIELD_BYTES) {
    return cleaned || FALLBACK_FILE_NAME;
  }
  const dot = cleaned.lastIndexOf(".");
  const extension = dot > 0 ? cleaned.slice(dot) : "";
  const keepExtension =
    extension.length > 1 && byteLength(extension) <= MAX_EXTENSION_BYTES;
  const suffix = keepExtension ? extension : "";
  const stem = keepExtension ? cleaned.slice(0, dot) : cleaned;
  const budget = S3_MAX_FILE_FIELD_BYTES - byteLength(suffix);
  const base = cutToBytes(stem, budget).trimEnd() || FALLBACK_FILE_NAME;
  return `${base}${suffix}`;
}
