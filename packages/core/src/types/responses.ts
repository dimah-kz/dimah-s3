import type {
  ConfirmPayload,
  DeletePayload,
  DownloadPayload,
  MultipartAbortPayload,
  MultipartCompletePayload,
  MultipartInitPayload,
  MultipartListPartsPayload,
  MultipartSignPartPayload,
  S3ObjectAcl,
  UploadPayload,
  UploadPresignMethod,
} from "./requests";

/** Response from {@link S3Api.delete}. */
export type DeleteResponse = {
  success: true;
  bucket: string;
  key: string;
};

/** Verified object metadata after confirm or multipart complete. */
export type ConfirmedObjectResponse = {
  /** S3 object key. */
  key: string;
  /** Target bucket. */
  bucket: string;
  /** MIME type from HeadObject. */
  contentType?: string;
  /** Verified size in bytes. */
  contentLength: number;
  /** ETag from HeadObject. */
  eTag?: string;
  /** Object metadata. */
  metadata: Record<string, string>;
  /** Resolved ACL. Omitted when ACL lookup is disabled or unsupported. */
  acl?: S3ObjectAcl;
  /** Stored filename. */
  fileName?: string;
  /** S3 version ID. */
  versionId?: string;
  /** Last modified timestamp. */
  lastModified?: string;
};

/** Response from {@link S3Api.confirm}. */
export type UploadConfirmResponse = ConfirmedObjectResponse;

/** Response from {@link S3Api.multipart.complete}. */
export type MultipartCompleteResponse = ConfirmedObjectResponse & {
  uploadId: string;
};

/** Response from {@link S3Api.multipart.abort}. */
export type MultipartAbortResponse = {
  aborted: boolean;
  bucket: string;
  key: string;
  uploadId: string;
};

/** Presigned GET URL for download. */
export type DownloadPresignResponse = {
  /** S3 object key. */
  key: string;
  /** Target bucket. */
  bucket: string;
  /** Presigned URL. */
  url: string;
  /** Validity in seconds. */
  expiresIn: number;
};

type UploadPresignBase = {
  /** S3 object key. */
  key: string;
  /** Target bucket. */
  bucket: string;
  /** Presigned upload URL. */
  url: string;
  /** Validity in seconds. */
  expiresIn: number;
};

/** Presigned upload URL and method-specific fields. */
export type UploadPresignResponse = UploadPresignBase &
  (
    | {
        method: Extract<UploadPresignMethod, "POST">;
        /** Form fields — append to FormData before the file. */
        fields: Record<string, string>;
      }
    | {
        method: Extract<UploadPresignMethod, "PUT">;
        /** Request headers for the PUT. */
        headers: Record<string, string>;
      }
  );

/** Response from multipart upload initialization. */
export type MultipartInitResponse = {
  /** S3 object key. */
  key: string;
  /** Target bucket. */
  bucket: string;
  /** S3 multipart upload ID. */
  uploadId: string;
};

/** Presigned URL for a single multipart part. */
export type MultipartPartResponse = {
  /** Presigned PUT URL for this part. */
  url: string;
  /** 1-based part number. */
  partNumber: number;
  /** Multipart upload ID. */
  uploadId: string;
  /** Target bucket. */
  bucket: string;
  /** Validity in seconds. */
  expiresIn: number;
  /** Exact byte size locked into this part's presigned URL signature. */
  partSize: number;
};

/** A part already uploaded in a multipart session. */
export type MultipartPartInfo = {
  /** 1-based part number. */
  partNumber: number;
  /** Part size in bytes. */
  size: number;
  /** Part ETag from S3. */
  eTag: string;
};

/** Response from listing uploaded multipart parts. */
export type MultipartListPartsResponse = {
  parts: MultipartPartInfo[];
};

/**
 * Presign API protocol shared by `@dimah-s3/react` hooks and `@dimah-s3/server`.
 *
 * Implement with `createS3Client()` from `@dimah-s3/core` / `@dimah-s3/react`,
 * or any custom backend.
 */
export type S3Api = {
  upload: (payload: UploadPayload) => Promise<UploadPresignResponse>;
  confirm: (payload: ConfirmPayload) => Promise<UploadConfirmResponse>;
  download: (payload: DownloadPayload) => Promise<DownloadPresignResponse>;
  delete: (payload: DeletePayload) => Promise<DeleteResponse>;
  multipart: {
    init: (payload: MultipartInitPayload) => Promise<MultipartInitResponse>;
    signPart: (
      payload: MultipartSignPartPayload,
    ) => Promise<MultipartPartResponse>;
    listParts: (
      payload: MultipartListPartsPayload,
    ) => Promise<MultipartListPartsResponse>;
    complete: (
      payload: MultipartCompletePayload,
    ) => Promise<MultipartCompleteResponse>;
    abort: (payload: MultipartAbortPayload) => Promise<MultipartAbortResponse>;
  };
};
