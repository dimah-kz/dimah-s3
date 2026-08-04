import type { UploadPresignMethod } from "./upload-presign-method";

/** S3 object ACL. */
export type S3ObjectAcl = "private" | "public-read";

/**
 * Server-side auth context for `dimahS3().api` calls (guards / db scope).
 * Ignored by {@link createS3Client} — never sent over the wire.
 */
export type S3ApiHeaders = {
  /** Forwarded into a synthetic `Request` for server-side `api` calls. */
  headers?: HeadersInit;
};

/** Payload for {@link S3Api.upload}. */
export type UploadPayload = S3ApiHeaders & {
  /** S3 object key. */
  key: string;
  /** Declared MIME type. */
  contentType?: string;
  /** Declared size in bytes. */
  fileSize?: number;
  /** Custom object metadata (`x-amz-meta-*`). */
  metadata?: Record<string, string>;
  /** Override default bucket. */
  bucket?: string;
  /** Requested ACL. */
  acl?: S3ObjectAcl;
  /** Original filename for `Content-Disposition`. */
  fileName?: string;
};

/** Payload for {@link S3Api.confirm}. */
export type ConfirmPayload = S3ApiHeaders & {
  /** S3 object key. */
  key: string;
  /** Override default bucket. */
  bucket?: string;
};

/** Options for {@link S3Api.download}. */
export type DownloadOptions = S3ApiHeaders & {
  /** Download filename for `Content-Disposition`. */
  fileName?: string;
  /** Override default bucket. */
  bucket?: string;
};

/** Options for {@link S3Api.delete}. */
export type DeleteOptions = S3ApiHeaders & {
  /** Override default bucket. */
  bucket?: string;
};

/** Payload for {@link S3Api.multipart.init}. Same fields as {@link UploadPayload}. */
export type MultipartInitPayload = UploadPayload;

/** Payload for {@link S3Api.multipart.signPart}. */
export type MultipartSignPartPayload = S3ApiHeaders & {
  /** S3 object key. */
  key: string;
  /** Multipart upload ID. */
  uploadId: string;
  /** 1-based part number. */
  partNumber: number;
  /** Byte size locked into the presigned URL signature. */
  partSize?: number;
  /** Override default bucket. */
  bucket?: string;
};

/** Payload for {@link S3Api.multipart.listParts}. */
export type MultipartListPartsPayload = S3ApiHeaders & {
  /** S3 object key. */
  key: string;
  /** Multipart upload ID. */
  uploadId: string;
  /** Override default bucket. */
  bucket?: string;
};

/** A completed multipart part reference for {@link S3Api.multipart.complete}. */
export type MultipartCompletedPartRef = {
  /** 1-based part number. */
  partNumber: number;
};

/** Payload for {@link S3Api.multipart.complete}. */
export type MultipartCompletePayload = S3ApiHeaders & {
  /** S3 object key. */
  key: string;
  /** Multipart upload ID. */
  uploadId: string;
  /** Parts to assemble (order does not matter — S3 sorts by part number). */
  parts: MultipartCompletedPartRef[];
  /** Override default bucket. */
  bucket?: string;
};

/** Payload for {@link S3Api.multipart.abort}. */
export type MultipartAbortPayload = S3ApiHeaders & {
  /** S3 object key. */
  key: string;
  /** Multipart upload ID. */
  uploadId: string;
  /** Override default bucket. */
  bucket?: string;
};

export type { UploadPresignMethod };
