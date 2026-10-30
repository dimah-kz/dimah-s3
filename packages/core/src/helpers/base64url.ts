/** Bytes per `String.fromCharCode` call, well under engine argument limits. */
const CHUNK_SIZE = 0x8000;

const BASE64URL_PATTERN = /^[\w-]*$/;

const encoder = new TextEncoder();

/**
 * Standard padded base64 of `bytes`. Uses `btoa`, so it runs in browsers,
 * workers, and Node without `Buffer`.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + CHUNK_SIZE),
    );
  }
  return btoa(binary);
}

/**
 * Unpadded base64url (RFC 4648 §5) of `bytes`. A string is encoded as UTF-8
 * first. Does not need `Buffer`.
 */
export function base64UrlEncode(bytes: Uint8Array | string): string {
  const data = typeof bytes === "string" ? encoder.encode(bytes) : bytes;
  return bytesToBase64(data)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

/**
 * Decode unpadded base64url back to bytes.
 * Throws a `TypeError` when `value` is not valid base64url or is not the
 * canonical encoding of its bytes (non-zero trailing bits), so one byte
 * sequence has exactly one accepted string.
 */
export function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> {
  if (!BASE64URL_PATTERN.test(value) || value.length % 4 === 1) {
    throw new TypeError("Invalid base64url string");
  }
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  if (base64UrlEncode(bytes) !== value) {
    throw new TypeError("Invalid base64url string");
  }
  return bytes;
}
