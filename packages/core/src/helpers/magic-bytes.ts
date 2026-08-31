type MagicMatch = {
  mime: string;
  bytes: number[];
  offset?: number;
};

const MAGIC: readonly MagicMatch[] = [
  { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { mime: "image/gif", bytes: [0x47, 0x49, 0x46, 0x38] },
  { mime: "image/webp", bytes: [0x52, 0x49, 0x46, 0x46], offset: 0 },
  { mime: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46] },
  { mime: "application/zip", bytes: [0x50, 0x4b, 0x03, 0x04] },
  { mime: "video/webm", bytes: [0x1a, 0x45, 0xdf, 0xa3] },
];

function prefixEquals(
  bytes: Uint8Array,
  expected: readonly number[],
  offset = 0,
): boolean {
  if (bytes.length < offset + expected.length) return false;
  return expected.every((value, i) => bytes[offset + i] === value);
}

/**
 * Sniff a MIME type from the start of a file. Returns `undefined` when
 * the prefix is unknown — this is not a substitute for `fileTypes`.
 */
export function sniffContentType(bytes: Uint8Array): string | undefined {
  if (prefixEquals(bytes, [0x52, 0x49, 0x46, 0x46]) && bytes.length >= 12) {
    const tag = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    if (tag === "WEBP") return "image/webp";
  }
  for (const entry of MAGIC) {
    if (entry.mime === "image/webp") continue;
    if (prefixEquals(bytes, entry.bytes, entry.offset)) return entry.mime;
  }
  return undefined;
}

/**
 * Whether `bytes` match `expected` (exact MIME or `image/*`).
 * Unknown prefixes return `false`.
 */
export function matchesMagicBytes(
  bytes: Uint8Array,
  expected: string,
): boolean {
  const sniffed = sniffContentType(bytes);
  if (!sniffed) return false;
  if (expected.endsWith("/*")) {
    return sniffed.startsWith(expected.replace("/*", "/"));
  }
  return sniffed === expected;
}
