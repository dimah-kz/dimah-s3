import { baseType } from "./content-type";

/** Bytes to read from the start of an object before sniffing it. */
export const SNIFF_BYTE_LENGTH = 4096;

type Signature = {
  /** Type {@link sniffContentType} reports. */
  type: string;
  /** Other declared types the same bytes satisfy. */
  aliases?: readonly string[];
  test: (bytes: Uint8Array) => boolean;
};

/**
 * ISO base media (`ftyp`) brands. A known major brand decides the type;
 * otherwise compatible brands are checked in this order.
 */
const FTYP_BRANDS: readonly { brands: readonly string[]; type: string }[] = [
  { brands: ["avif", "avis"], type: "image/avif" },
  {
    brands: ["heic", "heix", "heim", "heis", "hevc", "hevx"],
    type: "image/heic",
  },
  { brands: ["qt  "], type: "video/quicktime" },
  { brands: ["M4A ", "M4B ", "M4P "], type: "audio/mp4" },
  {
    brands: [
      "isom",
      "iso2",
      "iso4",
      "iso5",
      "iso6",
      "mp41",
      "mp42",
      "mp71",
      "avc1",
      "dash",
      "M4V ",
      "MSNV",
      "f4v ",
    ],
    type: "video/mp4",
  },
];

function startsWith(
  bytes: Uint8Array,
  expected: readonly number[],
  offset = 0,
): boolean {
  if (bytes.length < offset + expected.length) return false;
  return expected.every((value, i) => bytes[offset + i] === value);
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end));
}

function hasAscii(bytes: Uint8Array, text: string, offset = 0): boolean {
  return ascii(bytes, offset, offset + text.length) === text;
}

/** RIFF container whose form type (bytes 8..12) is `form`. */
function isRiff(bytes: Uint8Array, form: string): boolean {
  return hasAscii(bytes, "RIFF") && hasAscii(bytes, form, 8);
}

function ftypTypeOf(brand: string): string | undefined {
  return FTYP_BRANDS.find((entry) => entry.brands.includes(brand))?.type;
}

/**
 * Type of an ISO base media file from its `ftyp` box. The major brand wins
 * when it is known; otherwise the compatible brands that fit in `bytes`
 * are checked.
 */
function ftypType(bytes: Uint8Array): string | undefined {
  if (!hasAscii(bytes, "ftyp", 4) || bytes.length < 12) return undefined;
  const major = ftypTypeOf(ascii(bytes, 8, 12));
  if (major) return major;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const boxEnd = Math.min(view.getUint32(0), bytes.length);
  const brands: string[] = [];
  for (let offset = 16; offset + 4 <= boxEnd; offset += 4) {
    brands.push(ascii(bytes, offset, offset + 4));
  }
  return FTYP_BRANDS.find((entry) =>
    entry.brands.some((brand) => brands.includes(brand)),
  )?.type;
}

/** MPEG-1/2/2.5 Layer III frame header (frame sync plus valid fields). */
function isMp3Frame(bytes: Uint8Array): boolean {
  if (bytes.length < 3 || bytes[0] !== 0xff) return false;
  const version = (bytes[1] >> 3) & 0b11;
  const layer = (bytes[1] >> 1) & 0b11;
  const bitrate = bytes[2] >> 4;
  const sampleRate = (bytes[2] >> 2) & 0b11;
  return (
    (bytes[1] & 0xe0) === 0xe0 &&
    version !== 0b01 &&
    layer === 0b01 &&
    bitrate !== 0b1111 &&
    sampleRate !== 0b11
  );
}

/**
 * Offset just past a leading ID3v2 tag (header, syncsafe-sized body, and
 * v2.4 footer), or `undefined` when `bytes` do not start with a valid one.
 * Taggers prepend ID3v2 to FLAC as well as MP3, so the audio starts there.
 */
function id3v2End(bytes: Uint8Array): number | undefined {
  if (bytes.length < 10 || !hasAscii(bytes, "ID3")) return undefined;
  if (bytes[3] < 2 || bytes[3] > 4) return undefined;
  const size = bytes.subarray(6, 10);
  if (size.some((byte) => byte & 0x80)) return undefined;
  const footer = bytes[5] & 0x10 ? 10 : 0;
  return (
    10 + ((size[0] << 21) | (size[1] << 14) | (size[2] << 7) | size[3]) + footer
  );
}

/** Bytes after a leading ID3v2 tag; empty when there is none or it runs past `bytes`. */
function afterId3v2(bytes: Uint8Array): Uint8Array {
  const end = id3v2End(bytes);
  return end === undefined ? new Uint8Array() : bytes.subarray(end);
}

/** An ID3v2 tag that ends at or past the sniffed bytes: the audio after it is unseen. */
function hasTruncatedId3v2(bytes: Uint8Array): boolean {
  const end = id3v2End(bytes);
  return end !== undefined && end >= bytes.length;
}

function ftypSignature(type: string, aliases?: readonly string[]): Signature {
  return { type, aliases, test: (bytes) => ftypType(bytes) === type };
}

const SIGNATURES: readonly Signature[] = [
  {
    type: "image/png",
    test: (bytes) => startsWith(bytes, [0x89, 0x50, 0x4e, 0x47]),
  },
  {
    type: "image/jpeg",
    test: (bytes) => startsWith(bytes, [0xff, 0xd8, 0xff]),
  },
  { type: "image/gif", test: (bytes) => hasAscii(bytes, "GIF8") },
  { type: "image/webp", test: (bytes) => isRiff(bytes, "WEBP") },
  ftypSignature("image/avif"),
  ftypSignature("image/heic", ["image/heif"]),
  ftypSignature("video/quicktime"),
  ftypSignature("audio/mp4", ["audio/x-m4a", "video/mp4"]),
  ftypSignature("video/mp4", ["audio/mp4", "audio/x-m4a", "video/x-m4v"]),
  { type: "application/pdf", test: (bytes) => hasAscii(bytes, "%PDF") },
  {
    type: "application/zip",
    aliases: ["application/x-zip-compressed"],
    test: (bytes) => startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]),
  },
  {
    type: "video/webm",
    aliases: ["audio/webm"],
    test: (bytes) => startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3]),
  },
  {
    type: "audio/flac",
    aliases: ["audio/x-flac"],
    test: (bytes) => hasAscii(afterId3v2(bytes), "fLaC"),
  },
  {
    // The tag hides what follows: MP3 is likelier, but FLAC is not ruled out.
    type: "audio/mpeg",
    aliases: ["audio/mp3", "audio/flac", "audio/x-flac"],
    test: hasTruncatedId3v2,
  },
  {
    type: "audio/mpeg",
    aliases: ["audio/mp3"],
    test: (bytes) => hasAscii(bytes, "ID3") || isMp3Frame(bytes),
  },
  {
    type: "audio/ogg",
    aliases: ["video/ogg", "application/ogg"],
    test: (bytes) => hasAscii(bytes, "OggS"),
  },
  {
    type: "audio/wav",
    aliases: ["audio/wave", "audio/x-wav", "audio/vnd.wave"],
    test: (bytes) => isRiff(bytes, "WAVE"),
  },
  {
    type: "audio/flac",
    aliases: ["audio/x-flac"],
    test: (bytes) => hasAscii(bytes, "fLaC"),
  },
];

function typesOf(signature: Signature): readonly string[] {
  return [signature.type, ...(signature.aliases ?? [])];
}

function sniffSignature(bytes: Uint8Array): Signature | undefined {
  return SIGNATURES.find((signature) => signature.test(bytes));
}

/**
 * Sniff a MIME type from the start of a file. Returns `undefined` when
 * the prefix is unknown — this is not a substitute for `fileTypes`.
 */
export function sniffContentType(bytes: Uint8Array): string | undefined {
  return sniffSignature(bytes)?.type;
}

/**
 * Whether {@link matchesMagicBytes} can verify a declared `type`. Types with
 * no known signature (such as `text/plain`) return `false`.
 */
export function isSniffableType(type: string): boolean {
  const base = baseType(type);
  return SIGNATURES.some((signature) => typesOf(signature).includes(base));
}

/**
 * Whether `bytes` match `expected` (exact MIME or `type/*`). Common aliases
 * count, so `audio/x-wav` matches a WAV file. Unknown prefixes return `false`.
 */
export function matchesMagicBytes(
  bytes: Uint8Array,
  expected: string,
): boolean {
  const signature = sniffSignature(bytes);
  if (!signature) return false;
  const base = baseType(expected);
  const types = typesOf(signature);
  if (base.endsWith("/*")) {
    const prefix = base.slice(0, -1);
    return types.some((type) => type.startsWith(prefix));
  }
  return types.includes(base);
}
