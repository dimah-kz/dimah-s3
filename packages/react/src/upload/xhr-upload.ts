import { s3Error, type APIError } from "@dimah-s3/core";

export type SendXhrUploadOptions = {
  method: "POST" | "PUT";
  url: string;
  body: FormData | Blob;
  /** Sent exactly as given. */
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** The share of the request body sent so far, from 0 to 1. */
  onProgress?: (fraction: number) => void;
};

/**
 * Sends `body` with `XMLHttpRequest`, which reports upload progress.
 * Rejects with `UPLOAD_FAILED` carrying S3's status on a non-2xx response,
 * `NETWORK_ERROR` when the request fails, and `signal.reason` on abort.
 */
export async function sendXhrUpload(
  options: SendXhrUploadOptions,
): Promise<void> {
  const { method, url, body, headers = {}, signal, onProgress } = options;
  signal?.throwIfAborted();

  const xhr = new XMLHttpRequest();
  const settled = new Promise<APIError | null>((resolve) => {
    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress?.(event.loaded / event.total);
      }
    });
    xhr.addEventListener("load", () => {
      const { status } = xhr;
      resolve(
        status >= 200 && status < 300
          ? null
          : s3Error("UPLOAD_FAILED", { status }, { status }),
      );
    });
    xhr.addEventListener("error", () => resolve(s3Error("NETWORK_ERROR")));
    xhr.addEventListener("abort", () => resolve(s3Error("NETWORK_ERROR")));
  });

  const onAbort = () => xhr.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    xhr.open(method, url);
    for (const [name, value] of Object.entries(headers)) {
      xhr.setRequestHeader(name, value);
    }
    xhr.send(body);
    const error = await settled;
    signal?.throwIfAborted();
    if (error) throw error;
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }
}
