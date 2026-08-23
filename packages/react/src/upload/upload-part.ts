import { sendXhrUpload } from "./xhr-upload";

export function uploadPart(
  blob: Blob,
  presignedUrl: string,
  partLoaded: { bytes: number },
  reportProgress: () => void,
  signal?: AbortSignal,
): Promise<void> {
  return sendXhrUpload({
    method: "PUT",
    url: presignedUrl,
    body: blob,
    signal,
    errorLabel: "Part upload",
    onProgress: (loaded) => {
      partLoaded.bytes = loaded;
      reportProgress();
    },
  }).then(() => {
    partLoaded.bytes = blob.size;
    reportProgress();
  });
}
