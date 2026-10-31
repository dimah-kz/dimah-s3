import type { UploadTransport } from "@/types/upload";
import { transferProgress } from "./progress";
import { sendXhrUpload } from "./xhr-upload";

/**
 * The default {@link UploadTransport}. Sends `file` to the presigned URL with
 * exactly the presign's PUT `headers`, or as a form with its POST `fields`
 * first (S3 requires the fields before the file).
 */
export const sendPresignedUpload: UploadTransport = (
  file,
  presign,
  { onProgress, signal },
) => {
  const reportFraction = (fraction: number) =>
    onProgress?.(transferProgress(Math.round(fraction * file.size), file.size));

  if (presign.method === "PUT") {
    return sendXhrUpload({
      method: "PUT",
      url: presign.url,
      body: file,
      headers: presign.headers,
      signal,
      onProgress: reportFraction,
    });
  }

  const form = new FormData();
  for (const [name, value] of Object.entries(presign.fields)) {
    form.append(name, value);
  }
  form.append("file", file);
  return sendXhrUpload({
    method: "POST",
    url: presign.url,
    body: form,
    signal,
    onProgress: reportFraction,
  });
};
