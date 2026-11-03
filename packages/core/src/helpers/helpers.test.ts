import { afterEach, describe, expect, it, vi } from "vitest";
import { buildContentDisposition } from "./build-content-disposition";
import { buildObjectKey } from "./build-object-key";
import {
  parseFileName,
  fileNameFromKey,
  resolveStoredFileName,
} from "./parse-file-name";
import {
  normalizeObjectKey,
  objectKeyByteLength,
  S3_MAX_OBJECT_KEY_BYTES,
} from "./normalize-object-key";
import { fitFileName } from "./fit-file-name";
import { S3_MAX_FILE_FIELD_BYTES } from "@/limits";
import { fileNameSchema } from "../schema/shared";
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

  it("limits keys to 1024 UTF-8 bytes", () => {
    const key1024 = `${"€".repeat(341)}a`;
    expect(objectKeyByteLength(key1024)).toBe(S3_MAX_OBJECT_KEY_BYTES);
    expect(normalizeObjectKey(`/${key1024}/`)).toBe(key1024);
    expect(normalizeObjectKey(`${key1024}a`)).toBeNull();
    // 700 characters, 2100 bytes.
    expect(normalizeObjectKey("あ".repeat(700))).toBeNull();
  });
});

describe("fitFileName", () => {
  /** 100 CJK characters (300 bytes) plus `.docx`. */
  const LONG_CJK_NAME = `${"文".repeat(100)}.docx`;

  function utf8Bytes(text: string): number {
    return new TextEncoder().encode(text).byteLength;
  }

  it("returns a valid name unchanged", () => {
    for (const name of ["report.pdf", "a b.txt", "文件.docx"]) {
      expect(fitFileName(name)).toBe(name);
    }
    const name255 = `${"é".repeat(125)}a.txt`;
    expect(utf8Bytes(name255)).toBe(255);
    expect(fitFileName(name255)).toBe(name255);
  });

  it("fits a long non-ASCII name to 255 bytes and keeps the extension", () => {
    expect(utf8Bytes(LONG_CJK_NAME)).toBe(305);
    const fitted = fitFileName(LONG_CJK_NAME);
    expect(utf8Bytes(fitted)).toBeLessThanOrEqual(S3_MAX_FILE_FIELD_BYTES);
    expect(fitted).toBe(`${"文".repeat(83)}.docx`);
    expect(fileNameSchema.safeParse(LONG_CJK_NAME).success).toBe(false);
    expect(fileNameSchema.parse(fitted)).toBe(fitted);
  });

  it("never splits a surrogate pair or an emoji sequence", () => {
    // "😀" is 4 bytes (two UTF-16 units); 254 bytes of "a" leave 1 byte.
    const pair = fitFileName(`${"a".repeat(254)}😀😀`);
    expect(pair).toBe("a".repeat(254));
    expect(pair.isWellFormed()).toBe(true);

    // A family emoji is one grapheme of 25 bytes: it is dropped whole.
    const family = "👨‍👩‍👧‍👦";
    const fitted = fitFileName(`${"a".repeat(240)}${family}.png`);
    expect(fitted).toBe(`${"a".repeat(240)}.png`);
  });

  it("removes control characters and trims", () => {
    const fitted = fitFileName(" \u0007report\u0000.pdf\n ");
    expect(fitted).toBe("report.pdf");
    expect(fileNameSchema.parse(fitted)).toBe(fitted);
    expect(fileNameSchema.safeParse("a\u0007.pdf").success).toBe(false);
    expect(fileNameSchema.safeParse(fitFileName("a\u0007.pdf")).success).toBe(
      true,
    );
  });

  it("falls back to file when nothing usable is left", () => {
    expect(fitFileName("")).toBe("file");
    expect(fitFileName(" \u0001\u0002 ")).toBe("file");
  });

  it("does not keep a long extension or a dotfile prefix as the extension", () => {
    const longExtension = `a.${"x".repeat(300)}`;
    const fitted = fitFileName(longExtension);
    expect(utf8Bytes(fitted)).toBe(255);
    expect(fitted.startsWith("a.")).toBe(true);

    const dotfile = `.${"x".repeat(300)}`;
    expect(fitFileName(dotfile)).toBe(dotfile.slice(0, 255));
  });

  it("cuts a single oversized grapheme on code points", () => {
    const zalgo = `a${"́".repeat(200)}.txt`;
    const fitted = fitFileName(zalgo);
    expect(utf8Bytes(fitted)).toBeLessThanOrEqual(S3_MAX_FILE_FIELD_BYTES);
    expect(fitted.endsWith(".txt")).toBe(true);
    expect(fitted.startsWith("á")).toBe(true);
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

  it("looks past an ID3v2 tag for FLAC or an MPEG frame", () => {
    // ID3v2.4 header with a 20-byte (syncsafe) tag body.
    const tag = bytesOf(
      "ID3",
      [0x04, 0, 0, 0, 0, 0, 20],
      new Array(20).fill(0),
    );
    const flac = bytesOf([...tag], "fLaC", [0, 0, 0, 0x22]);
    expect(sniffContentType(flac)).toBe("audio/flac");
    expect(matchesMagicBytes(flac, "audio/flac")).toBe(true);
    expect(matchesMagicBytes(flac, "audio/mpeg")).toBe(false);

    // Footer flag adds 10 bytes after the body.
    const footer = bytesOf(
      "ID3",
      [0x04, 0, 0x10, 0, 0, 0, 20],
      new Array(30).fill(0),
      "fLaC",
    );
    expect(sniffContentType(footer)).toBe("audio/flac");

    const mp3 = bytesOf([...tag], [0xff, 0xfb, 0x90, 0x64]);
    expect(sniffContentType(mp3)).toBe("audio/mpeg");
    expect(matchesMagicBytes(mp3, "audio/flac")).toBe(false);

    const unknown = bytesOf([...tag], "hello");
    expect(sniffContentType(unknown)).toBe("audio/mpeg");
    expect(matchesMagicBytes(unknown, "audio/flac")).toBe(false);
  });

  it("accepts FLAC or MP3 when an ID3v2 tag runs past the sniffed bytes", () => {
    // Syncsafe size 0x00 0x01 0x00 0x00: a 16384-byte tag body.
    const bytes = new Uint8Array(4096);
    bytes.set(bytesOf("ID3", [0x03, 0, 0, 0, 0x01, 0, 0]));
    expect(sniffContentType(bytes)).toBe("audio/mpeg");
    expect(matchesMagicBytes(bytes, "audio/mpeg")).toBe(true);
    expect(matchesMagicBytes(bytes, "audio/flac")).toBe(true);
    expect(matchesMagicBytes(bytes, "audio/x-flac")).toBe(true);
    expect(matchesMagicBytes(bytes, "audio/ogg")).toBe(false);
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
    const bytes = new Uint8Array(200_000).map((_, index) => index % 256);
    const decoded = base64UrlDecode(base64UrlEncode(bytes));
    expect(decoded.length).toBe(bytes.length);
    // A direct compare. `toEqual` on this buffer builds a diff large enough
    // to time the test out.
    let mismatch = -1;
    for (let index = 0; index < bytes.length; index++) {
      if (decoded[index] !== bytes[index]) {
        mismatch = index;
        break;
      }
    }
    expect(mismatch).toBe(-1);
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

describe("file name and key hardening", () => {
  it("fits lone surrogates and bidi controls out of a name", () => {
    expect(fitFileName("a\ud800b.txt")).toBe("a\ufffdb.txt");
    expect(fitFileName("invoice\u202Efdp.exe")).toBe("invoicefdp.exe");
    // The joiner inside an emoji is a format character too; it stays.
    expect(fitFileName("👩‍💻.png")).toBe("👩‍💻.png");
  });

  it("rejects such names on the wire, so the server never builds a 500", () => {
    expect(fileNameSchema.safeParse("a\ud800b.txt").success).toBe(false);
    expect(fileNameSchema.safeParse("invoice\u202Efdp.exe").success).toBe(
      false,
    );
    expect(fileNameSchema.parse(fitFileName("a\ud800b.txt"))).toBe(
      "a\ufffdb.txt",
    );
  });

  it("refuses keys with surrounding whitespace, control characters, or lone surrogates", () => {
    expect(normalizeObjectKey("docs/a.pdf ")).toBeNull();
    expect(normalizeObjectKey(" docs/a.pdf")).toBeNull();
    expect(normalizeObjectKey("docs/a\tb.pdf")).toBeNull();
    expect(normalizeObjectKey("docs/a\ud800.pdf")).toBeNull();
    expect(normalizeObjectKey("docs/a b.pdf")).toBe("docs/a b.pdf");
  });
});

describe("Content-Disposition, RFC 5987 and 6266", () => {
  it("percent-encodes the characters ext-value reserves", () => {
    expect(buildContentDisposition("it's (1)*.pdf")).toBe(
      `attachment; filename="it's (1)*.pdf"; filename*=UTF-8''it%27s%20%281%29%2A.pdf`,
    );
  });

  it("keeps % out of the ASCII fallback", () => {
    expect(buildContentDisposition("100%.txt")).toContain(
      'filename="100_.txt"',
    );
  });

  it("parses a language tag, escaped quotes, and a bare token", () => {
    expect(
      parseFileName("attachment; filename*=UTF-8'en'r%C3%A9sum%C3%A9.pdf"),
    ).toBe("résumé.pdf");
    expect(parseFileName('attachment; filename="say \\"hi\\".txt"')).toBe(
      'say "hi".txt',
    );
    expect(parseFileName("attachment; filename=report.pdf")).toBe("report.pdf");
    for (const name of ["it's (1)*.pdf", "a b.png", "résumé.pdf"]) {
      expect(parseFileName(buildContentDisposition(name))).toBe(name);
    }
  });
});

describe("more magic bytes", () => {
  it("verifies BMP, TIFF, ICO and gzip", () => {
    const bmp = new Uint8Array(32);
    bmp.set([0x42, 0x4d]);
    bmp[14] = 40;
    expect(sniffContentType(bmp)).toBe("image/bmp");
    expect(matchesMagicBytes(bmp, "image/bmp")).toBe(true);
    expect(matchesMagicBytes(new Uint8Array(32), "image/bmp")).toBe(false);
    expect(isSniffableType("image/tiff")).toBe(true);
    expect(
      matchesMagicBytes(new Uint8Array([0x1f, 0x8b, 8, 0]), "application/gzip"),
    ).toBe(true);
    expect(
      matchesMagicBytes(
        new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]),
        "video/x-matroska",
      ),
    ).toBe(true);
  });
});
