import type {
  UploadProgress,
  UploadRequestOptions,
  RetryConfig,
} from "../types";
import type { S3Api } from "@dimah-s3/core";
import type { UploadStore } from "../types/upload-store";
import { withRetry } from "./retry";
import { uploadPart } from "./upload-part";

/** Returns the byte size of a specific part (last part may be smaller). */
function resolvePartSize(
  partIndex: number,
  totalParts: number,
  partSize: number,
  fileSize: number,
): number {
  return partIndex === totalParts - 1
    ? fileSize - partIndex * partSize
    : partSize;
}

export async function uploadMultipart(
  api: S3Api,
  file: File,
  objectKey: string,
  partSize: number,
  concurrentParts: number,
  onProgress?: (progress: UploadProgress) => void,
  signal?: AbortSignal,
  requestOptions?: UploadRequestOptions,
  retryConfig?: RetryConfig,
  uploadStore?: UploadStore | false,
  onPartUpload?: (partNumber: number, totalParts: number) => void,
  onMultipartInit?: (uploadId: string, key: string) => void,
): Promise<string | undefined> {
  const bucket = requestOptions?.bucket;
  const contentType = requestOptions?.contentType ?? file.type;

  // Resolve the active store.
  // null  → resumability disabled (uploadStore omitted, false, or SSR)
  // store → resumability enabled; persist uploadId across sessions
  const store: UploadStore | null =
    uploadStore != null && uploadStore !== false ? uploadStore : null;

  let uploadId: string;
  let key: string;
  const completedPartNumbers = new Set<number>();

  // ── Attempt to resume an existing upload ─────────────────────────────────
  const existing = store ? await store.get(objectKey, file.size) : null;

  if (existing) {
    try {
      // Verify the uploadId is still valid on S3 and fetch already-done parts.
      const { parts } = await api.multipart.listParts({
        key: existing.key,
        uploadId: existing.uploadId,
        bucket: bucket ?? existing.bucket,
      });
      uploadId = existing.uploadId;
      key = existing.key;
      for (const p of parts) completedPartNumbers.add(p.partNumber);
      onMultipartInit?.(uploadId, key);
    } catch {
      // uploadId is expired or no longer valid — start a fresh upload.
      await store?.delete(objectKey);
      const result = await api.multipart.init({
        key: objectKey,
        contentType,
        fileSize: file.size,
        fileName:
          requestOptions?.fileName !== null
            ? (requestOptions?.fileName ?? file.name)
            : undefined,
        metadata: requestOptions?.metadata,
        bucket,
        acl: requestOptions?.acl,
      });
      uploadId = result.uploadId;
      key = result.key;
      await store?.set({ uploadId, key, fileSize: file.size, bucket });
      onMultipartInit?.(uploadId, key);
    }
  } else {
    const result = await api.multipart.init({
      key: objectKey,
      contentType,
      fileSize: file.size,
      fileName:
        requestOptions?.fileName !== null
          ? (requestOptions?.fileName ?? file.name)
          : undefined,
      metadata: requestOptions?.metadata,
      bucket,
      acl: requestOptions?.acl,
    });
    uploadId = result.uploadId;
    key = result.key;
    await store?.set({ uploadId, key, fileSize: file.size, bucket });
    onMultipartInit?.(uploadId, key);
  }

  // ── Setup progress tracking ───────────────────────────────────────────────
  const totalParts = Math.ceil(file.size / partSize);

  // Pre-fill progress bytes for already-completed parts.
  const partProgress: Array<{ bytes: number }> = Array.from(
    { length: totalParts },
    (_, i) => ({
      bytes: completedPartNumbers.has(i + 1)
        ? resolvePartSize(i, totalParts, partSize, file.size)
        : 0,
    }),
  );

  // Pre-register completed parts so complete() receives a full list.
  const parts: Array<{ partNumber: number }> = Array.from(
    completedPartNumbers,
    (n) => ({ partNumber: n }),
  );

  const reportProgress = () => {
    const loaded = partProgress.reduce((sum, p) => sum + p.bytes, 0);
    onProgress?.({
      loaded,
      total: file.size,
      percent: Math.round((loaded / file.size) * 100),
    });
  };

  // Report initial progress for pre-completed parts before uploading starts.
  if (completedPartNumbers.size > 0) {
    reportProgress();
  }

  // ── Upload remaining parts ────────────────────────────────────────────────
  try {
    for (
      let batchStart = 0;
      batchStart < totalParts;
      batchStart += concurrentParts
    ) {
      if (signal?.aborted) {
        throw new DOMException("Upload aborted", "AbortError");
      }

      const batchEnd = Math.min(batchStart + concurrentParts, totalParts);
      const batch: Array<Promise<{ partNumber: number }>> = [];

      for (let i = batchStart; i < batchEnd; i++) {
        const partNumber = i + 1;

        // Skip parts that were already uploaded in a previous attempt.
        if (completedPartNumbers.has(partNumber)) continue;

        const start = i * partSize;
        const end = Math.min(start + partSize, file.size);
        const blob = file.slice(start, end);

        batch.push(
          withRetry(
            async () => {
              const { presignedUrl } = await api.multipart.signPart({
                key,
                uploadId,
                partNumber,
                partSize: blob.size,
                bucket,
              });

              partProgress[i].bytes = 0;

              await uploadPart(
                blob,
                presignedUrl,
                partProgress[i],
                reportProgress,
                signal,
              );

              onPartUpload?.(partNumber, totalParts);
              return { partNumber };
            },
            retryConfig,
            signal,
          ),
        );
      }

      const batchResults = await Promise.all(batch);
      parts.push(...batchResults);
    }

    parts.sort((a, b) => a.partNumber - b.partNumber);

    const result = await api.multipart.complete({
      key,
      uploadId,
      parts,
      bucket,
    });

    // Upload finished successfully — remove from store.
    await store?.delete(objectKey);

    onProgress?.({ loaded: file.size, total: file.size, percent: 100 });
    return result.eTag;
  } catch (err) {
    if (store === null) {
      // Resumability is disabled — clean up the S3 multipart upload immediately.
      api.multipart.abort({ key, uploadId, bucket }).catch(() => {});
    }
    // With store active: preserve uploadId so the upload can be resumed later.
    // The S3 multipart upload is left open (expires automatically per bucket policy).
    throw err;
  }
}
