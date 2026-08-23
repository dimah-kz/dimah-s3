import type { UploadProgress } from "../types";
import { sendXhrUpload } from "./xhr-upload";

function reportByteProgress(onProgress?: (progress: UploadProgress) => void) {
  return (loaded: number, total: number) => {
    onProgress?.({
      loaded,
      total,
      percent: total > 0 ? Math.round((loaded / total) * 100) : 0,
    });
  };
}

/**
 * Uploads a file directly to S3 using a presigned POST form.
 *
 * All policy fields (acl, Content-Type, content-length-range, signature, etc.)
 * are embedded in `fields` and must be appended to the FormData **before** the
 * file — this is an S3 requirement.
 */
export function uploadSimple(
  file: File,
  url: string,
  fields: Record<string, string>,
  onProgress?: (progress: UploadProgress) => void,
  signal?: AbortSignal,
): Promise<void> {
  const formData = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    formData.append(k, v);
  }
  formData.append("file", file);

  return sendXhrUpload({
    method: "POST",
    url,
    body: formData,
    signal,
    onProgress: reportByteProgress(onProgress),
  }).then(() => {
    onProgress?.({ loaded: file.size, total: file.size, percent: 100 });
  });
}

/**
 * Uploads a file directly to S3 using a presigned PUT URL.
 *
 * Use this when the server is configured with `upload.method = "PUT"` — for
 * example with Cloudflare R2 which does not support presigned POST.
 */
export function uploadPut(
  file: File,
  url: string,
  headers: Record<string, string>,
  onProgress?: (progress: UploadProgress) => void,
  signal?: AbortSignal,
): Promise<void> {
  return sendXhrUpload({
    method: "PUT",
    url,
    body: file,
    headers,
    signal,
    onProgress: reportByteProgress(onProgress),
  }).then(() => {
    onProgress?.({ loaded: file.size, total: file.size, percent: 100 });
  });
}
