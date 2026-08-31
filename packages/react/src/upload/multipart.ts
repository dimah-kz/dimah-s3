import type {
  UploadProgress,
  UploadRequestOptions,
  RetryConfig,
  UploadResult,
} from "@/types";
import type { S3Api } from "@dimah-s3/core";
import type { UploadStore } from "@/types/upload-store";
import { withRetry } from "./retry";
import { uploadPart } from "./upload-part";
import { multipartResumeKey } from "./resume-key";

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
  route: string,
  partSize: number,
  concurrentParts: number,
  onProgress?: (progress: UploadProgress) => void,
  signal?: AbortSignal,
  requestOptions?: UploadRequestOptions,
  retryConfig?: RetryConfig,
  uploadStore?: UploadStore | false,
  onPartUpload?: (partNumber: number, totalParts: number) => void,
  onMultipartInit?: (uploadId: string, key: string) => void,
): Promise<UploadResult> {
  const rawContentType = requestOptions?.contentType ?? file.type;
  const contentType =
    rawContentType.trim() === "" ? undefined : rawContentType;
  const fileName = requestOptions?.fileName || file.name;
  const resumeKey = multipartResumeKey(route, file);

  // Resolve the active store.
  // null  → resumability disabled (uploadStore omitted, false, or SSR)
  // store → resumability enabled; persist uploadId across sessions
  const store: UploadStore | null =
    uploadStore != null && uploadStore !== false ? uploadStore : null;

  const completedPartNumbers = new Set<number>();

  const initUpload = async () => {
    const result = await api.multipart.init({
      route,
      contentType,
      fileSize: file.size,
      fileName,
      metadata: requestOptions?.metadata,
    });
    await store?.set({
      resumeKey,
      uploadId: result.uploadId,
      key: result.key,
      fileSize: file.size,
    });
    onMultipartInit?.(result.uploadId, result.key);
    return { uploadId: result.uploadId, key: result.key };
  };

  // ── Attempt to resume an existing upload ─────────────────────────────────
  const existing = store ? await store.get(resumeKey, file.size) : null;

  let uploadId: string;
  let key: string;

  if (existing) {
    try {
      // Verify the uploadId is still valid on S3 and fetch already-done parts.
      const { parts } = await api.multipart.listParts({
        route,
        key: existing.key,
        uploadId: existing.uploadId,
      });
      uploadId = existing.uploadId;
      key = existing.key;
      for (const p of parts) completedPartNumbers.add(p.partNumber);
      onMultipartInit?.(uploadId, key);
    } catch {
      // uploadId is expired or no longer valid — start a fresh upload.
      await store?.delete(resumeKey);
      ({ uploadId, key } = await initUpload());
    }
  } else {
    ({ uploadId, key } = await initUpload());
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
              const { url } = await api.multipart.signPart({
                route,
                key,
                uploadId,
                partNumber,
                partSize: blob.size,
              });

              partProgress[i].bytes = 0;

              await uploadPart(
                blob,
                url,
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
      route,
      key,
      uploadId,
      parts,
    });

    // Upload finished successfully — remove from store.
    await store?.delete(resumeKey);

    onProgress?.({ loaded: file.size, total: file.size, percent: 100 });
    return {
      key,
      eTag: result.eTag,
      contentLength: result.contentLength,
      contentType: result.contentType,
      fileName: result.fileName,
    };
  } catch (err) {
    if (store === null) {
      // Resumability is disabled — clean up the S3 multipart upload immediately.
      api.multipart.abort({ route, key, uploadId }).catch(() => {});
    }
    // With store active: preserve uploadId so the upload can be resumed later.
    // The S3 multipart upload is left open (expires automatically per bucket policy).
    throw err;
  }
}
