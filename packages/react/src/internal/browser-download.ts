/**
 * Some browsers read the blob after `click()` returns, so the object URL is
 * revoked a little later.
 */
const REVOKE_DELAY_MS = 30_000;

/**
 * Hands `url` to the browser through a temporary link, like a navigation.
 * The response's `Content-Disposition` decides whether it saves or opens.
 */
export function startBrowserDownload(url: string): void {
  clickLink(url);
}

/** Saves `blob` as a file named `fileName` through an object URL. */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  clickLink(url, fileName);
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}

/**
 * Reads a fetch response body into a Blob typed with its `Content-Type`.
 * `onChunk` receives the bytes read so far after each chunk. Aborting the
 * request's signal rejects with the abort reason.
 */
export async function readResponseBlob(
  response: Response,
  onChunk?: (loaded: number) => void,
): Promise<Blob> {
  if (!response.body) {
    const blob = await response.blob();
    onChunk?.(blob.size);
    return blob;
  }

  const type = response.headers.get("content-type") ?? "";
  const reader = response.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onChunk?.(loaded);
  }
  return new Blob(chunks, { type });
}

function clickLink(href: string, fileName?: string) {
  const link = document.createElement("a");
  link.href = href;
  if (fileName !== undefined) link.download = fileName;
  link.style.display = "none";
  document.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
  }
}
