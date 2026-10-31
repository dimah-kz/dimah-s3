import type { MultipartPartResponse } from "@dimah-s3/core";
import { sendXhrUpload } from "./xhr-upload";

/** PUTs one multipart part to its presigned URL with exactly the signed headers. */
export function uploadPart(
  part: Blob,
  signed: MultipartPartResponse,
  options: { signal?: AbortSignal; onProgress?: (loaded: number) => void },
): Promise<void> {
  const { signal, onProgress } = options;
  return sendXhrUpload({
    method: "PUT",
    url: signed.url,
    body: part,
    headers: signed.headers,
    signal,
    onProgress: (fraction) => onProgress?.(Math.round(fraction * part.size)),
  });
}
