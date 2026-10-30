import { afterEach, describe, expect, it, vi } from "vitest";
import { buildContentDisposition } from "./build-content-disposition";
import { buildObjectKey } from "./build-object-key";
import { formatFileSize } from "./format-file-size";
import {
  parseFileName,
  fileNameFromKey,
  resolveStoredFileName,
} from "./parse-file-name";
import { sanitizeFileName } from "./sanitize-file-name";
import { truncateFileName } from "./truncate-file-name";
import { normalizeObjectKey } from "./normalize-object-key";
import {
  isSniffableType,
  matchesMagicBytes,
  sniffContentType,
} from "./magic-bytes";
import { buildPublicObjectUrl } from "./public-object-url";
import { sha256Base64, sha256Blob } from "./checksum";
import { base64UrlDecode, base64UrlEncode } from "./base64url";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("sanitizeFileName", () => {
  it("replaces quotes, backslashes, newlines, and NUL", () => {
    expect(sanitizeFileName('a"b\\c\nd')).toBe("a_b_c_d");
    expect(sanitizeFileName("a\0b")).toBe("a_b");
  });
});

describe("buildContentDisposition / parseFileName", () => {
  it("round-trips unicode names via filename*", () => {
    const header = buildContentDisposition("фото.png");
    expect(header.startsWith("attachment;")).toBe(true);
    expect(header).toContain('filename="____.png"');
    expect(header).toContain("filename*=UTF-8''");
    expect(parseFileName(header)).toBe("фото.png");
  });

  it("builds an inline disposition", () => {
    expect(buildContentDisposition("a.png", "inline")).toMatch(/^inline;/);
  });

  it("falls back to quoted ASCII filename", () => {
    expect(parseFileName('attachment; filename="plain.txt"')).toBe("plain.txt");
  });

  it("returns undefined for missing or malformed headers", () => {
    expect(parseFileName(null)).toBeUndefined();
    expect(parseFileName("inline")).toBeUndefined();
  });

  it("falls back to the key leaf when disposition is missing", () => {
    expect(resolveStoredFileName(null, "uploads/uuid/a.png")).toBe("a.png");
    expect(resolveStoredFileName('attachment; filename="x.txt"', "k")).toBe(
      "x.txt",
    );
  });
});

describe("fileNameFromKey", () => {
  it("returns the last path segment", () => {
    expect(fileNameFromKey("uploads/uuid/a.png")).toBe("a.png");
    expect(fileNameFromKey("a.png")).toBe("a.png");
    expect(fileNameFromKey("/uploads//a.png/")).toBe("a.png");
    expect(fileNameFromKey("")).toBeUndefined();
  });
});

describe("formatFileSize", () => {
  it.each([
    [0, "0 B"],
    [1, "1 B"],
    [1024, "1.0 KB"],
    [1024 * 1024, "1.0 MB"],
  ])("formats %s", (bytes, expected) => {
    expect(formatFileSize(bytes)).toBe(expected);
  });

  it("guards non-finite, negative, and oversized values", () => {
    expect(formatFileSize(-1)).toBe("0 B");
    expect(formatFileSize(Number.NaN)).toBe("0 B");
    expect(formatFileSize(Number.POSITIVE_INFINITY)).toBe("0 B");
    expect(formatFileSize(1024 ** 6)).toBe("1.0 EB");
    expect(formatFileSize(Number.MAX_VALUE).endsWith(" EB")).toBe(true);
  });

  it("uses locale digits and unit labels", () => {
    expect(
      formatFileSize(1.5 * 1024 * 1024, {
        locale: "fa",
        units: { MB: "مگابایت" },
      }),
    ).toBe("۱٫۵ مگابایت");
    expect(formatFileSize(1023, { locale: "de" })).toBe("1023 B");
    expect(formatFileSize(1536, { locale: "de" })).toBe("1,5 KB");
  });
});

describe("truncateFileName", () => {
  it("leaves short names unchanged", () => {
    expect(truncateFileName("short.txt")).toBe("short.txt");
  });

  it("keeps the extension when truncating", () => {
    const name = `${"a".repeat(80)}.png`;
    const truncated = truncateFileName(name, 20);
    expect(truncated.endsWith(".png")).toBe(true);
    expect(truncated).toContain("…");
    expect(truncated.length).toBeLessThan(name.length);
  });

  it("truncates names without an extension", () => {
    const truncated = truncateFileName("a".repeat(80), 10);
    expect(truncated.endsWith("…")).toBe(true);
    expect(truncated).toHaveLength(10);
  });
});

describe("normalizeObjectKey", () => {
  it("strips slashes and rejects unsafe segments", () => {
    expect(normalizeObjectKey("/a/b.png/")).toBe("a/b.png");
    expect(
      normalizeObjectKey(`/${"/".repeat(100_000)}a/b${"/".repeat(100_000)}`),
    ).toBe("a/b");
    expect(normalizeObjectKey("/".repeat(100_000))).toBeNull();
    expect(normalizeObjectKey("../secret")).toBeNull();
    expect(normalizeObjectKey("a/../b")).toBeNull();
    expect(normalizeObjectKey("a\\b")).toBeNull();
    expect(normalizeObjectKey("a\0b")).toBeNull();
  });
});

describe("buildObjectKey", () => {
  it("joins trimmed segments", () => {
    expect(buildObjectKey("/users/", "1", "/avatar.png")).toBe(
      "users/1/avatar.png",
    );
  });

  it("drops empty segments", () => {
    expect(buildObjectKey("", "a", "/", "b")).toBe("a/b");
    expect(buildObjectKey(`${"/".repeat(100_000)}a/`, "/b/")).toBe("a/b");
  });
});

/** Bytes from numbers and ASCII strings, in order. */
function bytesOf(...parts: Array<string | readonly number[]>): Uint8Array {
  return Uint8Array.from(
    parts.flatMap((part) =>
      typeof part === "string"
        ? Array.from(part, (char) => char.charCodeAt(0))
        : [...part],
    ),
  );
}

/** An `ftyp` box with a major brand and compatible brands. */
function ftyp(major: string, ...compatible: string[]): Uint8Array {
  const size = 16 + compatible.length * 4;
  return bytesOf([0, 0, 0, size], "ftyp", major, [0, 0, 0, 0], ...compatible);
}

describe("sniffContentType / matchesMagicBytes", () => {
  it("sniffs PNG and PDF prefixes", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
    expect(sniffContentType(png)).toBe("image/png");
    expect(matchesMagicBytes(png, "image/*")).toBe(true);
    expect(matchesMagicBytes(pdf, "application/pdf")).toBe(true);
    expect(matchesMagicBytes(png, "application/pdf")).toBe(false);
  });

  it.each([
    ["webp", bytesOf("RIFF", [0x24, 0, 0, 0], "WEBPVP8 "), "image/webp"],
    ["wav", bytesOf("RIFF", [0x24, 0, 0, 0], "WAVEfmt "), "audio/wav"],
    ["avif", ftyp("avif", "mif1", "miaf"), "image/avif"],
    ["avif (compatible brand)", ftyp("mif1", "avif", "miaf"), "image/avif"],
    ["heic", ftyp("heic", "mif1", "heic"), "image/heic"],
    ["quicktime", ftyp("qt  ", "qt  "), "video/quicktime"],
    ["mp4", ftyp("isom", "isom", "iso2", "avc1", "mp41"), "video/mp4"],
    ["m4a", ftyp("M4A ", "M4A ", "mp42", "isom"), "audio/mp4"],
    ["mp3 (ID3 tag)", bytesOf("ID3", [0x04, 0, 0, 0, 0, 0, 0]), "audio/mpeg"],
    ["mp3 (frame sync)", bytesOf([0xff, 0xfb, 0x90, 0x64]), "audio/mpeg"],
    ["ogg", bytesOf("OggS", [0, 0x02]), "audio/ogg"],
    ["flac", bytesOf("fLaC", [0, 0, 0, 0x22]), "audio/flac"],
    ["webm", bytesOf([0x1a, 0x45, 0xdf, 0xa3, 0x01]), "video/webm"],
  ])("sniffs %s", (_label, bytes, type) => {
    expect(sniffContentType(bytes)).toBe(type);
    expect(matchesMagicBytes(bytes, type)).toBe(true);
    expect(isSniffableType(type)).toBe(true);
  });

  it("lets a known major brand win over compatible brands", () => {
    const m4v = ftyp("M4V ", "M4V ", "M4A ", "mp42", "isom");
    expect(sniffContentType(m4v)).toBe("video/mp4");
    expect(matchesMagicBytes(m4v, "video/x-m4v")).toBe(true);

    const mp4 = ftyp("mp42", "mp42", "qt  ", "isom");
    expect(sniffContentType(mp4)).toBe("video/mp4");
    expect(matchesMagicBytes(mp4, "video/mp4")).toBe(true);
  });

  it("does not report a RIFF file that is neither WebP nor WAV", () => {
    expect(
      sniffContentType(bytesOf("RIFF", [0x24, 0, 0, 0], "AVI LIST")),
    ).toBeUndefined();
  });

  it("does not mistake JPEG or AAC frames for MP3", () => {
    expect(sniffContentType(bytesOf([0xff, 0xd8, 0xff, 0xe0]))).toBe(
      "image/jpeg",
    );
    expect(sniffContentType(bytesOf([0xff, 0xf1, 0x50, 0x80]))).toBeUndefined();
  });

  it("returns undefined for short or unknown prefixes", () => {
    expect(sniffContentType(new Uint8Array())).toBeUndefined();
    expect(sniffContentType(bytesOf("RIFF"))).toBeUndefined();
    expect(sniffContentType(bytesOf([0, 0, 0, 0x10], "ftyp"))).toBeUndefined();
    expect(sniffContentType(bytesOf("hello world"))).toBeUndefined();
  });

  it("matches declared aliases, parameters, and wildcards", () => {
    const wav = bytesOf("RIFF", [0x24, 0, 0, 0], "WAVEfmt ");
    const ogg = bytesOf("OggS", [0, 0x02]);
    const m4a = ftyp("M4A ", "M4A ", "mp42", "isom");
    expect(matchesMagicBytes(wav, "audio/x-wav")).toBe(true);
    expect(matchesMagicBytes(ogg, "video/ogg")).toBe(true);
    expect(matchesMagicBytes(ogg, "Audio/OGG; codecs=opus")).toBe(true);
    expect(matchesMagicBytes(m4a, "audio/*")).toBe(true);
    expect(matchesMagicBytes(wav, "video/*")).toBe(false);
    expect(matchesMagicBytes(bytesOf("hello"), "text/*")).toBe(false);
  });

  it("knows which declared types it can verify", () => {
    expect(isSniffableType("image/jpeg")).toBe(true);
    expect(isSniffableType("audio/x-flac")).toBe(true);
    expect(isSniffableType("IMAGE/PNG; q=1")).toBe(true);
    expect(isSniffableType("text/plain")).toBe(false);
    expect(isSniffableType("image/*")).toBe(false);
  });
});

describe("buildPublicObjectUrl", () => {
  it("joins origin and encoded key segments", () => {
    expect(
      buildPublicObjectUrl({
        baseUrl: "https://cdn.example.com/",
        key: "uploads/a b.png",
      }),
    ).toBe("https://cdn.example.com/uploads/a%20b.png");
    expect(
      buildPublicObjectUrl({
        baseUrl: `https://cdn.example.com${"/".repeat(100_000)}`,
        key: "/uploads/a.png/",
      }),
    ).toBe("https://cdn.example.com/uploads/a.png");
  });
});

describe("sha256Base64 / sha256Blob", () => {
  it("hashes bytes as unpadded base64", async () => {
    const digest = await sha256Base64(new TextEncoder().encode("hi"));
    expect(digest).toBe("j0NDRmSPa5bfid2pAcUXaxCm2Dlh3TwayItZstwyeqQ");
  });

  it.each([
    ["0 B", 0],
    ["1 B", 1],
    ["3 MiB", 3 * 1024 * 1024],
  ])("streams %s to the same digest", async (_label, size) => {
    const bytes = new Uint8Array(size).map((_, i) => i % 251);
    await expect(sha256Blob(new Blob([bytes]))).resolves.toBe(
      await sha256Base64(bytes),
    );
  });

  it("rejects with the abort reason", async () => {
    const reason = new DOMException("Stopped", "AbortError");
    const controller = new AbortController();
    controller.abort(reason);
    await expect(
      sha256Blob(new Blob(["hi"]), { signal: controller.signal }),
    ).rejects.toBe(reason);
  });

  it("stops between chunks when the signal aborts", async () => {
    const controller = new AbortController();
    const blob = new Blob([new Uint8Array(3 * 1024 * 1024)]);
    const arrayBuffer = vi.spyOn(Blob.prototype, "arrayBuffer");
    arrayBuffer.mockImplementationOnce(async function (this: Blob) {
      controller.abort();
      return new ArrayBuffer(this.size);
    });
    await expect(
      sha256Blob(blob, { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(arrayBuffer).toHaveBeenCalledTimes(1);
  });
});

describe("base64UrlEncode / base64UrlDecode", () => {
  it("works without Buffer", () => {
    vi.stubGlobal("Buffer", undefined);
    const bytes = Uint8Array.from({ length: 256 }, (_, i) => i);
    expect(base64UrlDecode(base64UrlEncode(bytes))).toEqual(bytes);
    expect(
      new TextDecoder().decode(base64UrlDecode(base64UrlEncode("фото ✓"))),
    ).toBe("фото ✓");
  });

  it.each([
    ["", ""],
    ["f", "Zg"],
    ["fo", "Zm8"],
    ["foo", "Zm9v"],
    ["foob", "Zm9vYg"],
  ])("encodes %j without padding", (input, encoded) => {
    expect(base64UrlEncode(input)).toBe(encoded);
    expect(new TextDecoder().decode(base64UrlDecode(encoded))).toBe(input);
  });

  it("uses the URL-safe alphabet", () => {
    const bytes = new Uint8Array([0xfb, 0xff, 0xbf]);
    expect(base64UrlEncode(bytes)).toBe("-_-_");
    expect(base64UrlDecode("-_-_")).toEqual(bytes);
  });

  it("encodes large inputs", () => {
    const bytes = new Uint8Array(200_000).map((_, i) => i % 256);
    expect(base64UrlDecode(base64UrlEncode(bytes))).toEqual(bytes);
  });

  it.each(["a", "ab+c", "ab/c", "Zg==", "Zm 9v"])("rejects %j", (value) => {
    expect(() => base64UrlDecode(value)).toThrow(TypeError);
  });

  it.each(["AB", "Zh", "Zm9"])(
    "rejects %j with non-zero trailing bits",
    (value) => {
      expect(() => base64UrlDecode(value)).toThrow(TypeError);
    },
  );
});
