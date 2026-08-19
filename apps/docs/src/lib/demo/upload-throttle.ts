export const UPLOAD_READ_CHUNK_BYTES = 8_192;
/** Light throttle so progress is visible on fast localhost uploads. */
export const UPLOAD_CHUNK_DELAY_MS = 8;
export const UPLOAD_MAX_BYTES = 100 * 1024 * 1024;

function concatBytes(chunks: Uint8Array[]) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export async function readUploadBodySlowly(
  request: Request,
  expectedBytes: number | null,
) {
  const body = request.body;
  if (!body) {
    return {
      received: 0,
      error: "Missing request body",
      body: new Uint8Array(),
    };
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    for (
      let offset = 0;
      offset < value.byteLength;
      offset += UPLOAD_READ_CHUNK_BYTES
    ) {
      const chunkSize = Math.min(
        UPLOAD_READ_CHUNK_BYTES,
        value.byteLength - offset,
      );
      received += chunkSize;
      if (received > UPLOAD_MAX_BYTES) {
        return {
          received,
          error: "File too large for demo upload",
          body: new Uint8Array(),
        };
      }
      await new Promise((resolve) =>
        setTimeout(resolve, UPLOAD_CHUNK_DELAY_MS),
      );
    }
  }

  if (
    expectedBytes != null &&
    expectedBytes > 0 &&
    received !== expectedBytes
  ) {
    return {
      received,
      error: `Unexpected upload size (${received} vs ${expectedBytes})`,
      body: new Uint8Array(),
    };
  }

  return { received, error: null, body: concatBytes(chunks) };
}
