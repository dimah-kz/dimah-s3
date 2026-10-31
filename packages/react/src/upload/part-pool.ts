import { sha256Blob, type S3Api } from "@dimah-s3/core";
import { mapWithConcurrency } from "@/internal/pool";
import type { UploadFileOptions } from "@/types/upload";
import type { StoredUpload } from "@/types/upload-store";
import { DEFAULT_CONCURRENT_PARTS } from "./constants";
import { transferProgress } from "./progress";
import { withPresignedRetry } from "./retry";
import { uploadPart } from "./upload-part";

/** The server's part layout for one multipart upload. */
export type PartLayout = Pick<
  StoredUpload,
  "fileSize" | "partSize" | "partCount"
>;

/** Byte size of part `partNumber`. Only the last part may be smaller. */
export function layoutPartSize(layout: PartLayout, partNumber: number): number {
  const { fileSize, partSize, partCount } = layout;
  return partNumber < partCount
    ? partSize
    : fileSize - partSize * (partCount - 1);
}

/**
 * Uploads every part of `upload` that is not in `done` through a pool of
 * `concurrentParts` workers, following the server's layout. Each worker
 * hashes its part as a stream when the upload requires checksums, signs it,
 * and sends it with retries. The first failure aborts the parts still
 * running and rejects with that failure.
 */
export async function uploadParts(
  api: S3Api,
  file: File,
  upload: StoredUpload,
  done: ReadonlySet<number>,
  options: UploadFileOptions,
): Promise<void> {
  const { ticket, partSize, partCount, checksum } = upload;
  const { retry, onProgress, onPartUpload } = options;
  const loaded = Array.from({ length: partCount }, (_, index) =>
    done.has(index + 1) ? layoutPartSize(upload, index + 1) : 0,
  );
  const report = () => {
    const sent = loaded.reduce((sum, bytes) => sum + bytes, 0);
    onProgress?.(transferProgress(sent, file.size));
  };
  if (done.size > 0) report();

  const pending = Array.from(
    { length: partCount },
    (_, index) => index + 1,
  ).filter((partNumber) => !done.has(partNumber));

  const failure = new AbortController();
  const signal = options.signal
    ? AbortSignal.any([options.signal, failure.signal])
    : failure.signal;

  const sendOne = async (partNumber: number) => {
    const index = partNumber - 1;
    const start = index * partSize;
    const part = file.slice(start, start + layoutPartSize(upload, partNumber));
    const partChecksum = checksum
      ? await sha256Blob(part, { signal })
      : undefined;

    await withPresignedRetry(
      () =>
        api.multipart.signPart(
          {
            ticket,
            partNumber,
            ...(partChecksum ? { checksum: partChecksum } : {}),
          },
          { signal },
        ),
      (signed) => {
        loaded[index] = 0;
        report();
        return uploadPart(part, signed, {
          signal,
          onProgress: (bytes) => {
            loaded[index] = bytes;
            report();
          },
        });
      },
      { retry, signal },
    );

    loaded[index] = part.size;
    report();
    onPartUpload?.({ partNumber, totalParts: partCount });
  };

  try {
    await mapWithConcurrency(
      pending,
      options.concurrentParts ?? DEFAULT_CONCURRENT_PARTS,
      sendOne,
    );
  } catch (error) {
    failure.abort(error);
    throw error;
  }
}
