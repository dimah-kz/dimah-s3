import type {
  ConfirmPayload,
  DeleteOptions,
  DownloadOptions,
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
  success: boolean;
  bucket: string;
  key: string;
};

/** Response from {@link S3Api.multipart.complete}. */
export type MultipartCompleteResponse = {
  key: string;
  bucket: string;
  uploadId: string;
  /** Verified size in bytes. */
  contentLength: number;
  contentType?: string;
  eTag?: string;
  metadata: Record<string, string>;
  versionId?: string;
  lastModified?: string;
  /** Resolved ACL. Omitted when ACL lookup is disabled or unsupported. */
  acl?: S3ObjectAcl;
  /** Stored filename. */
  fileName?: string;
};

/** Response from {@link S3Api.multipart.abort}. */
export type MultipartAbortResponse = {
  aborted: boolean;
};

/** Presigned GET URL for download. */
export type PresignResponse = {
  /** S3 object key. */
  key: string;
  /** Target bucket. */
  bucket: string;
  /** Presigned URL. */
  url: string;
  /** Validity in seconds. */
  expiresIn: number;
};

/** Presigned upload URL and method-specific fields. */
export type UploadPresignResponse = {
  /** S3 object key. */
  key: string;
  /** Target bucket. */
  bucket: string;
  /** Presigned upload URL. */
  url: string;
  /** Validity in seconds. */
  expiresIn: number;
  /** HTTP method for the upload request. */
  method: UploadPresignMethod;
  /** Present when `method` is `"POST"`. Must be appended to FormData before the file. */
  fields?: Record<string, string>;
  /** Present when `method` is `"PUT"`. Must be set as request headers on the PUT request. */
  headers?: Record<string, string>;
};

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
  presignedUrl: string;
  /** 1-based part number. */
  partNumber: number;
  /** Multipart upload ID. */
  uploadId: string;
  /** Target bucket. */
  bucket: string;
  /** Validity in seconds. */
  expiresIn: number;
  /** Exact byte size locked into this part's presigned URL signature. */
  partSize?: number;
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

/** Verified object metadata after upload confirmation. */
export type UploadConfirmResponse = {
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
  /** Object ACL. */
  acl?: S3ObjectAcl;
  /** Stored filename. */
  fileName?: string;
  /** S3 version ID. */
  versionId?: string;
  /** Last modified timestamp. */
  lastModified?: string;
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
  download: (
    key: string,
    options?: DownloadOptions,
  ) => Promise<PresignResponse>;
  delete: (key: string, options?: DeleteOptions) => Promise<DeleteResponse>;
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
