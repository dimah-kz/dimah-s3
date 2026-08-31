import type {
  FileUploadConfig,
  UploadProgress,
  UploadResult,
  UploadRequestOptions,
  S3ApiUploadTransport,
  UploadTransport,
} from "@/types";
import type { S3Api } from "@dimah-s3/core";
import { toUploadError } from "@/types/error";
import {
  DEFAULT_MULTIPART_THRESHOLD,
  DEFAULT_CONCURRENT_PARTS,
  DEFAULT_PART_SIZE,
} from "./constants";
import { withRetry } from "./retry";
import { uploadSimple, uploadPut } from "./presigned-http";
import { uploadMultipart } from "./multipart";

function getUploadTransport(api: S3Api): UploadTransport | undefined {
  const transport = (api as S3Api & S3ApiUploadTransport).uploadTransport;
  return typeof transport === "function" ? transport : undefined;
}

export type UploadEngineCallbacks = {
  onProgress?: (progress: UploadProgress) => void;
  /** Called when the upload transitions between internal phases. */
  onPhaseChange?: (phase: "presigning" | "uploading" | "finalizing") => void;
  /** Called after each individual multipart part is successfully uploaded. */
  onPartUpload?: (partNumber: number, totalParts: number) => void;
  /** Called once after `CreateMultipartUpload` succeeds with the S3-assigned `uploadId` and final object `key`. */
  onMultipartInit?: (uploadId: string, key: string) => void;
};

export async function uploadFile(
  api: S3Api,
  file: File,
  config: FileUploadConfig,
  callbacks: UploadEngineCallbacks = {},
  signal?: AbortSignal,
  requestOptions?: UploadRequestOptions,
): Promise<UploadResult> {
  const { route } = config;
  const useMultipart =
    config.multipart === true && file.size >= DEFAULT_MULTIPART_THRESHOLD;
  const concurrentParts = config.concurrentParts ?? DEFAULT_CONCURRENT_PARTS;
  const rawContentType = requestOptions?.contentType ?? file.type;
  const contentType = rawContentType.trim() === "" ? undefined : rawContentType;
  const fileName = requestOptions?.fileName || file.name;

  try {
    if (useMultipart) {
      callbacks.onPhaseChange?.("presigning");
      return await uploadMultipart(
        api,
        file,
        route,
        DEFAULT_PART_SIZE,
        concurrentParts,
        callbacks.onProgress,
        signal,
        requestOptions,
        config.retry,
        config.uploadStore,
        callbacks.onPartUpload,
        (uploadId, serverKey) => {
          callbacks.onPhaseChange?.("uploading");
          callbacks.onMultipartInit?.(uploadId, serverKey);
        },
      );
    }

    callbacks.onPhaseChange?.("presigning");
    const presign = await withRetry(
      async () =>
        api.upload({
          route,
          contentType,
          fileSize: file.size,
          fileName,
          metadata: requestOptions?.metadata,
        }),
      config.retry,
      signal,
    );

    callbacks.onPhaseChange?.("uploading");
    await withRetry(
      async () => {
        const transport = getUploadTransport(api);
        if (transport) {
          await transport(file, presign, {
            onProgress: callbacks.onProgress,
            signal,
          });
        } else if (presign.method === "PUT") {
          await uploadPut(
            file,
            presign.url,
            presign.headers,
            callbacks.onProgress,
            signal,
          );
        } else {
          await uploadSimple(
            file,
            presign.url,
            presign.fields,
            callbacks.onProgress,
            signal,
          );
        }
      },
      config.retry,
      signal,
    );

    callbacks.onPhaseChange?.("finalizing");
    const confirmed = await withRetry(
      async () =>
        api.confirm({
          route,
          key: presign.key,
        }),
      config.retry,
      signal,
    );
    return {
      key: confirmed.key,
      eTag: confirmed.eTag,
      contentLength: confirmed.contentLength,
      contentType: confirmed.contentType,
      fileName: confirmed.fileName,
    };
  } catch (err) {
    throw toUploadError(err, "uploading");
  }
}
