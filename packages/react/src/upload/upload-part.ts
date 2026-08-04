import { S3UploadError } from "../types/error";

export function uploadPart(
  blob: Blob,
  presignedUrl: string,
  partLoaded: { bytes: number },
  reportProgress: () => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    const onAbort = () => {
      xhr.abort();
      reject(new DOMException("Upload aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        partLoaded.bytes = e.loaded;
        reportProgress();
      }
    });

    xhr.addEventListener("load", () => {
      signal?.removeEventListener("abort", onAbort);
      if (xhr.status >= 200 && xhr.status < 300) {
        partLoaded.bytes = blob.size;
        reportProgress();
        resolve();
      } else {
        reject(
          new S3UploadError(
            `Part upload failed: ${xhr.status}`,
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
          "Part upload failed: network error",
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

    xhr.open("PUT", presignedUrl);
    xhr.send(blob);
  });
}
