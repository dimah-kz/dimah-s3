/** SHA-256 digest as unpadded base64 (S3 `ChecksumSHA256`). */
export async function sha256Base64(data: BufferSource): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digest);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=+$/, "");
}

/** SHA-256 of a `Blob` / `File` as unpadded base64. */
export async function sha256File(file: Blob): Promise<string> {
  return sha256Base64(await file.arrayBuffer());
}
