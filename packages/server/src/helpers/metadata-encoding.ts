import { base64UrlDecode, base64UrlEncode } from "@dimah-s3/core";

/** Values S3 and HTTP clients carry unchanged in an `x-amz-meta-*` header. */
const PLAIN_VALUE = /^(?:[\x21-\x7e](?:[\x20-\x7e]*[\x21-\x7e])?)?$/;

/** A value that reads as an RFC 2047 encoded word, so it must be encoded to survive a round trip. */
const ENCODED_WORD_LIKE = /^=\?.*\?=$/s;

/** One RFC 2047 encoded word: `=?charset?B|Q?text?=`, with an optional RFC 2231 language. */
const ENCODED_WORD = /^=\?([^?*]+)(?:\*[^?]*)?\?([bq])\?([^?]*)\?=$/i;

const UTF8_CHARSETS = new Set(["utf-8", "utf8", "us-ascii"]);

/**
 * Makes a metadata value safe to send as an `x-amz-meta-*` header. Printable
 * ASCII without surrounding spaces is kept as is. Anything else becomes one
 * RFC 2047 encoded word (`=?UTF-8?B?…?=`), the form S3 itself returns for
 * non-ASCII metadata.
 */
export function encodeMetadataValue(value: string): string {
  if (PLAIN_VALUE.test(value) && !ENCODED_WORD_LIKE.test(value)) return value;
  return `=?UTF-8?B?${toBase64(new TextEncoder().encode(value))}?=`;
}

/**
 * Reverses {@link encodeMetadataValue}, and decodes any RFC 2047 value S3
 * returns: one or more `B` or `Q` encoded words in UTF-8 or US-ASCII,
 * separated by whitespace. A value that is not a well-formed encoded word
 * is returned unchanged.
 */
export function decodeMetadataValue(value: string): string {
  const words = value.trim().split(/\s+/);
  const chunks: Uint8Array[] = [];
  for (const word of words) {
    const match = ENCODED_WORD.exec(word);
    if (!match || !UTF8_CHARSETS.has(match[1].toLowerCase())) return value;
    const bytes =
      match[2].toLowerCase() === "b"
        ? fromBase64(match[3])
        : fromQuotedPrintable(match[3]);
    if (!bytes) return value;
    chunks.push(bytes);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(concat(chunks));
  } catch {
    return value;
  }
}

function toBase64(bytes: Uint8Array): string {
  const url = base64UrlEncode(bytes).replaceAll("-", "+").replaceAll("_", "/");
  return url.padEnd(Math.ceil(url.length / 4) * 4, "=");
}

function fromBase64(text: string): Uint8Array | undefined {
  if (!/^[a-z0-9+/]*={0,2}$/i.test(text) || text.length % 4 !== 0) {
    return undefined;
  }
  try {
    return base64UrlDecode(
      text.replace(/=+$/, "").replaceAll("+", "-").replaceAll("/", "_"),
    );
  } catch {
    return undefined;
  }
}

/** RFC 2047 `Q` encoding: `_` is a space and `=XX` is a hex byte. */
function fromQuotedPrintable(text: string): Uint8Array | undefined {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === "_") {
      bytes.push(0x20);
    } else if (char === "=") {
      const hex = text.slice(i + 1, i + 3);
      if (!/^[0-9a-f]{2}$/i.test(hex)) return undefined;
      bytes.push(Number.parseInt(hex, 16));
      i += 2;
    } else {
      const code = char.charCodeAt(0);
      if (code < 0x21 || code > 0x7e) return undefined;
      bytes.push(code);
    }
  }
  return Uint8Array.from(bytes);
}

function concat(chunks: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(chunks.reduce((n, chunk) => n + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}
