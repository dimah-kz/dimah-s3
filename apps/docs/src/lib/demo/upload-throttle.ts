export const UPLOAD_READ_CHUNK_BYTES = 8_192;
/** Light throttle so progress is visible on fast localhost uploads. */
export const UPLOAD_CHUNK_DELAY_MS = 8;
export const UPLOAD_MAX_BYTES = 100 * 1024 * 1024;

export async function readUploadBodySlowly(
  request: Request,
  expectedBytes: number | null,
) {
  const body = request.body;
  if (!body) {
    return { received: 0, error: "Missing request body" };
  }

  const reader = body.getReader();
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
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
        return { received, error: "File too large for demo upload" };
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
    };
  }

  return { received, error: null };
}
