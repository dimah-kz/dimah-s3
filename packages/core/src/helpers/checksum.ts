import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToBase64 } from "./base64url";

/** Bytes read from a `Blob` per hash update. */
const CHUNK_SIZE = 1024 * 1024;

function toUnpaddedBase64(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/=+$/, "");
}

/** SHA-256 digest as unpadded base64 (S3 `ChecksumSHA256`). */
export async function sha256Base64(data: BufferSource): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return toUnpaddedBase64(new Uint8Array(digest));
}

/**
 * SHA-256 of a `Blob` / `File` as unpadded base64, read in 1 MiB chunks so
 * large files and multipart parts are never held in memory whole.
 * Rejects with `signal.reason` when `signal` aborts.
 */
export async function sha256Blob(
  blob: Blob,
  options: { signal?: AbortSignal } = {},
): Promise<string> {
  const { signal } = options;
  signal?.throwIfAborted();
  const hash = sha256.create();
  for (let offset = 0; offset < blob.size; offset += CHUNK_SIZE) {
    const chunk = await blob.slice(offset, offset + CHUNK_SIZE).arrayBuffer();
    signal?.throwIfAborted();
    hash.update(new Uint8Array(chunk));
  }
  return toUnpaddedBase64(hash.digest());
}
