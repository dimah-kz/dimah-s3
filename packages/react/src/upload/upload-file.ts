import {
  fitFileName,
  sha256Blob,
  type MultipartInitPayload,
  type S3Api,
} from "@dimah-s3/core";
import { toClientError } from "@/internal/client-error";
import type {
  S3ApiUploadTransport,
  UploadEnginePhase,
  UploadFileOptions,
  UploadResult,
  UploadTransport,
} from "@/types/upload";
import { DEFAULT_MULTIPART_THRESHOLD } from "./constants";
import { uploadMultipart } from "./multipart";
import { sendPresignedUpload } from "./presigned-http";
import { transferProgress } from "./progress";
import { withPresignedRetry, withRetry } from "./retry";

/**
 * Uploads one file and returns the verified object. Files of at least
 * `DEFAULT_MULTIPART_THRESHOLD` bytes use multipart when `policy.multipart`
 * is true; other files are presigned, sent and confirmed in one shot.
 *
 * Rejects with an `APIError`, or with `signal.reason` once `signal` aborts.
 * Phases run `preparing`, `presigning`, `uploading`, then `finalizing`.
 */
export async function uploadFile(
  api: S3Api,
  file: File,
  options: UploadFileOptions,
): Promise<UploadResult> {
  const { signal, policy } = options;
  const setPhase = phaseReporter(options.onPhaseChange);
  try {
    signal?.throwIfAborted();
    const payload = initPayload(file, options);
    if (policy.multipart && file.size >= DEFAULT_MULTIPART_THRESHOLD) {
      return await uploadMultipart(api, file, payload, options, setPhase);
    }
    return await uploadSingle(api, file, payload, options, setPhase);
  } catch (error) {
    signal?.throwIfAborted();
    throw toClientError(error);
  }
}

async function uploadSingle(
  api: S3Api,
  file: File,
  payload: MultipartInitPayload,
  options: UploadFileOptions,
  setPhase: (phase: UploadEnginePhase) => void,
): Promise<UploadResult> {
  const { signal, onProgress } = options;
  const transport = getUploadTransport(api) ?? sendPresignedUpload;

  setPhase("preparing");
  const checksum = options.policy.checksum
    ? await sha256Blob(file, { signal })
    : undefined;

  const presign = await withPresignedRetry(
    () => {
      setPhase("presigning");
      return api.upload(
        { ...payload, ...(checksum ? { checksum } : {}) },
        { signal },
      );
    },
    (signed) => {
      setPhase("uploading");
      return transport(file, signed, { onProgress, signal });
    },
    options,
  );
  onProgress?.(transferProgress(file.size, file.size));

  setPhase("finalizing");
  return withRetry(
    () => api.confirm({ ticket: presign.ticket }, { signal }),
    options,
  );
}

/** The presign body shared by single-shot and multipart uploads. */
function initPayload(
  file: File,
  options: UploadFileOptions,
): MultipartInitPayload {
  const { route, request = {} } = options;
  const type = (request.contentType ?? file.type).trim();
  return {
    route,
    name: fitFileName(request.fileName || file.name),
    size: file.size,
    ...(type ? { type } : {}),
    ...(request.metadata ? { metadata: request.metadata } : {}),
  };
}

function getUploadTransport(api: S3Api): UploadTransport | undefined {
  const transport = (api as S3Api & S3ApiUploadTransport).uploadTransport;
  return typeof transport === "function" ? transport : undefined;
}

/** Calls `onPhaseChange` only when the phase changes. */
function phaseReporter(
  onPhaseChange: UploadFileOptions["onPhaseChange"],
): (phase: UploadEnginePhase) => void {
  let current: UploadEnginePhase | null = null;
  return (phase) => {
    if (phase === current) return;
    current = phase;
    onPhaseChange?.(phase);
  };
}
