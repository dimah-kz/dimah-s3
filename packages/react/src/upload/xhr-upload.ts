import { S3UploadError } from "@/types/error";

export type SendXhrUploadOptions = {
  method: "POST" | "PUT";
  url: string;
  body: FormData | Blob;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  errorLabel?: string;
  onProgress?: (loaded: number, total: number) => void;
};

export function sendXhrUpload(options: SendXhrUploadOptions): Promise<void> {
  const {
    method,
    url,
    body,
    headers,
    signal,
    errorLabel = "Upload",
    onProgress,
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
        onProgress?.(e.loaded, e.total);
      }
    });

    xhr.addEventListener("load", () => {
      signal?.removeEventListener("abort", onAbort);
      if (xhr.status >= 200 && xhr.status < 300) {
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
