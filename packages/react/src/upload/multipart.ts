import {
  isS3ErrorCode,
  type MultipartInitPayload,
  type MultipartPartInfo,
  type S3Api,
} from "@dimah-s3/core";
import { reportCallbackError } from "@/internal/callbacks";
import type {
  UploadEnginePhase,
  UploadFileOptions,
  UploadResult,
} from "@/types/upload";
import type { StoredUpload, UploadStore } from "@/types/upload-store";
import { getUploadAbortKind } from "./abort";
import { layoutPartSize, uploadParts } from "./part-pool";
import { multipartResumeKey } from "./resume-key";
import { isRetryableError, withRetry } from "./retry";
import { isStoredUpload } from "./stored-upload";

type MultipartSession = {
  upload: StoredUpload;
  /** Part numbers already uploaded with the expected size. */
  done: ReadonlySet<number>;
};

/**
 * Resume keys of the multipart uploads running with a store in this page.
 * Module-wide, because two stores can share one backing storage.
 */
const activeResumeKeys = new Set<string>();

/**
 * Uploads `file` as a multipart upload in the layout the server picks at
 * init, resuming a stored upload when `options.uploadStore` has one.
 *
 * With a store, a request error or an abort with `uploadAbortReason("detach")`
 * keeps the server upload and its record for resuming. A cancel, any other
 * abort, or any failure without a store aborts the server upload and deletes
 * the record. While one upload of a resume key runs, another upload of the
 * same key runs without the store, so the two never share a session.
 */
export async function uploadMultipart(
  api: S3Api,
  file: File,
  payload: MultipartInitPayload,
  options: UploadFileOptions,
  setPhase: (phase: UploadEnginePhase) => void,
): Promise<UploadResult> {
  const resumeKey = multipartResumeKey(options.route, file, options.request);
  const store = activeResumeKeys.has(resumeKey)
    ? undefined
    : options.uploadStore;
  if (store) activeResumeKeys.add(resumeKey);
  try {
    return await runMultipart(api, file, payload, options, setPhase, {
      store,
      resumeKey,
    });
  } finally {
    if (store) activeResumeKeys.delete(resumeKey);
  }
}

/** The upload itself, with `store` unset when the resume key is taken. */
async function runMultipart(
  api: S3Api,
  file: File,
  payload: MultipartInitPayload,
  options: UploadFileOptions,
  setPhase: (phase: UploadEnginePhase) => void,
  { store, resumeKey }: { store: UploadStore | undefined; resumeKey: string },
): Promise<UploadResult> {
  const { signal } = options;

  setPhase("preparing");
  const resumed = store
    ? await resumeSession(api, file, store, resumeKey, options, setPhase)
    : null;

  let upload: StoredUpload;
  let done: ReadonlySet<number>;
  if (resumed) {
    ({ upload, done } = resumed);
  } else {
    setPhase("presigning");
    const init = await withRetry(
      () => api.multipart.init(payload, { signal }),
      options,
    );
    upload = {
      resumeKey,
      ticket: init.ticket,
      key: init.key,
      uploadId: init.uploadId,
      fileSize: file.size,
      partSize: init.partSize,
      partCount: init.partCount,
      checksum: init.checksum,
    };
    done = new Set();
  }

  try {
    if (store && !resumed) await quietly(() => store.set(upload));
    options.onMultipartInit?.({ uploadId: upload.uploadId, key: upload.key });

    setPhase("uploading");
    await uploadParts(api, file, upload, done, options);

    setPhase("finalizing");
    // The result is the confirmed object, without the multipart `uploadId`.
    const { uploadId: _uploadId, ...result } = await withRetry(
      () => api.multipart.complete({ ticket: upload.ticket }, { signal }),
      options,
    );
    if (store) await quietly(() => store.delete(resumeKey));
    return result;
  } catch (error) {
    const keep =
      store !== undefined && (!signal?.aborted || isDetached(signal));
    if (!keep) {
      abortQuietly(api, upload.ticket);
      if (store) await quietly(() => store.delete(resumeKey));
    }
    throw error;
  }
}

/**
 * Loads a stored upload and the parts S3 already has. A record with an
 * unknown shape is deleted. A record whose upload is gone or whose ticket no
 * longer verifies is aborted and deleted, so the caller starts over.
 *
 * Once a valid record is read, a cancel or a failure that retrying cannot fix
 * also aborts the server upload and deletes the record before rejecting, so
 * the next upload of the file starts fresh. A detach or a request error that
 * might pass later keeps both.
 */
async function resumeSession(
  api: S3Api,
  file: File,
  store: UploadStore,
  resumeKey: string,
  options: UploadFileOptions,
  setPhase: (phase: UploadEnginePhase) => void,
): Promise<MultipartSession | null> {
  const record = await readRecord(store, resumeKey, file.size);
  if (record === null) return null;
  if (
    !isStoredUpload(record) ||
    record.resumeKey !== resumeKey ||
    record.fileSize !== file.size
  ) {
    await quietly(() => store.delete(resumeKey));
    return null;
  }

  try {
    options.signal?.throwIfAborted();
    setPhase("presigning");
    const { parts } = await withRetry(
      () =>
        api.multipart.listParts(
          { ticket: record.ticket },
          { signal: options.signal },
        ),
      options,
    );
    return { upload: record, done: completedParts(record, parts) };
  } catch (error) {
    const { signal } = options;
    const keep = signal?.aborted ? isDetached(signal) : isRetryableError(error);
    if (keep) throw error;
    abortQuietly(api, record.ticket);
    await quietly(() => store.delete(resumeKey));
    if (signal?.aborted || !isSessionGone(error)) throw error;
    return null;
  }
}

function isDetached(signal: AbortSignal): boolean {
  return getUploadAbortKind(signal.reason) === "detach";
}

/** The stored record, or `null` when the store has none or fails. */
async function readRecord(
  store: UploadStore,
  resumeKey: string,
  fileSize: number,
): Promise<unknown> {
  try {
    return await store.get(resumeKey, fileSize);
  } catch (error) {
    reportCallbackError(error);
    return null;
  }
}

/** Parts that match the layout, and carry a checksum when one is required. */
function completedParts(
  upload: StoredUpload,
  parts: readonly MultipartPartInfo[],
): Set<number> {
  const done = new Set<number>();
  for (const { partNumber, size, checksum } of parts) {
    if (
      partNumber >= 1 &&
      partNumber <= upload.partCount &&
      size === layoutPartSize(upload, partNumber) &&
      (!upload.checksum || checksum !== undefined)
    ) {
      done.add(partNumber);
    }
  }
  return done;
}

function isSessionGone(error: unknown): boolean {
  return (
    isS3ErrorCode(error, "UPLOAD_TICKET_EXPIRED") ||
    isS3ErrorCode(error, "UPLOAD_TICKET_INVALID") ||
    isS3ErrorCode(error, "OBJECT_NOT_FOUND")
  );
}

/** Aborts the server upload in the background. Its error is ignored. */
function abortQuietly(api: S3Api, ticket: string): void {
  api.multipart.abort({ ticket }).catch(() => {});
}

/** Runs a store call. A failure is reported and never fails the upload. */
async function quietly(run: () => void | Promise<void>): Promise<void> {
  try {
    await run();
  } catch (error) {
    reportCallbackError(error);
  }
}
