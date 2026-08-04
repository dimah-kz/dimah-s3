import type { UploadProgress } from "../types";
import { S3UploadError } from "../types/error";

type XhrUploadOptions = {
  method: "POST" | "PUT";
  url: string;
  body: FormData | File;
  headers?: Record<string, string>;
  fileSize: number;
  onProgress?: (progress: UploadProgress) => void;
  signal?: AbortSignal;
  errorLabel?: string;
};

function sendXhrUpload(options: XhrUploadOptions): Promise<void> {
  const {
    method,
    url,
    body,
    headers,
    fileSize,
    onProgress,
    signal,
    errorLabel = "Upload",
  } = options;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    const onAbort = () => {
      xhr.abort();
      reject(new DOMException("Upload aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        onProgress?.({
          loaded: e.loaded,
          total: e.total,
          percent: Math.round((e.loaded / e.total) * 100),
        });
      }
    });

    xhr.addEventListener("load", () => {
      signal?.removeEventListener("abort", onAbort);
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.({ loaded: fileSize, total: fileSize, percent: 100 });
        resolve();
      } else {
        reject(
          new S3UploadError(
            `${errorLabel} failed: ${xhr.status} ${xhr.statusText}`,
            "HTTP_ERROR",
            xhr.status,
            "uploading",
          ),
        );
      }
    });

    xhr.addEventListener("error", () => {
      signal?.removeEventListener("abort", onAbort);
      reject(
        new S3UploadError(
          `${errorLabel} failed: network error`,
          "NETWORK_ERROR",
          0,
          "uploading",
        ),
      );
    });

    xhr.addEventListener("abort", () => {
      signal?.removeEventListener("abort", onAbort);
      reject(new DOMException("Upload aborted", "AbortError"));
    });

    xhr.open(method, url);
    if (headers) {
      for (const [k, v] of Object.entries(headers)) {
        xhr.setRequestHeader(k, v);
      }
    }
    xhr.send(body);
  });
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
    fileSize: file.size,
    onProgress,
    signal,
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
    fileSize: file.size,
    onProgress,
    signal,
  });
}
