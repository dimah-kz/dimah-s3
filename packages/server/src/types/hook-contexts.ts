import type {
  MultipartCompletedPartRef,
  MultipartPartInfo,
  S3ObjectAcl,
} from "@dimah-s3/core";

/** Context for the global `guard` hook. */
export type GuardContext = {
  /** The incoming HTTP request. */
  request: Request;
};

type ObjectContext = GuardContext & {
  /** S3 object key. */
  key: string;
  /** Target bucket. */
  bucket: string;
};

/**
 * Input to `prefix` (string or factory) and `resolveKey` on a feature config.
 * Prefer a `prefix` factory for per-user / per-tenant folders so already-
 * prefixed stored keys stay idempotent.
 */
export type ResolveKeyContext = {
  request: Request;
  /** Key the client sent. */
  proposedKey: string;
  fileName?: string;
  contentType?: string;
  bucket: string;
};

/** Context for `upload.guard`. Client-declared values are not verified by S3. */
export type UploadPresignGuardContext = ObjectContext & {
  /** MIME type the client sent — not verified until `onConfirmed`. */
  contentType?: string;
  /** Size the client sent — not verified until `onConfirmed`. */
  fileSize?: number;
  /** Custom object metadata. */
  metadata?: Record<string, string>;
  /** Requested ACL. */
  acl?: S3ObjectAcl;
  /** Original filename for `Content-Disposition`. */
  fileName?: string;
};

/** Context for `upload.onPresigned`. */
export type UploadOnPresignedContext = UploadPresignGuardContext & {
  /** Presigned upload URL. */
  url: string;
  /** Validity in seconds. */
  expiresIn: number;
};

/** Context for `upload.confirmGuard`. */
export type UploadConfirmGuardContext = ObjectContext;

/**
 * Context for `upload.onConfirmed`.
 * `contentLength` and `eTag` are verified by S3 via HeadObject.
 */
export type UploadOnConfirmedContext = GuardContext & {
  /** S3 object key. */
  key: string;
  /** Target bucket. */
  bucket: string;
  /** MIME type from HeadObject. */
  contentType?: string;
  /** Size from HeadObject — trust this, not the presign `fileSize`. */
  contentLength: number;
  /** ETag from HeadObject. */
  eTag?: string;
  /** Object metadata. */
  metadata?: Record<string, string>;
  /** Resolved ACL. Omitted when ACL lookup is disabled or unsupported. */
  acl?: S3ObjectAcl;
  /** Stored filename. */
  fileName?: string;
  /** S3 version ID. */
  versionId?: string;
  /** Last modified timestamp. */
  lastModified?: string;
};

/** Context for `download.guard`. */
export type DownloadPresignGuardContext = ObjectContext & {
  /** Download filename for Content-Disposition. */
  fileName?: string;
};

/** Context for `download.onPresigned`. */
export type DownloadOnPresignedContext = DownloadPresignGuardContext & {
  /** Presigned GET URL. */
  url: string;
  /** Validity in seconds. */
  expiresIn: number;
};

/** Context for `delete.guard`. */
export type DeleteGuardContext = ObjectContext;

/** Context for `delete.onDeleted`. */
export type DeleteOnDeletedContext = ObjectContext;

/** Shared base for multipart operations that already have an upload id. */
export type MultipartUploadContext = ObjectContext & {
  /** Multipart upload ID. */
  uploadId: string;
};

/** Context for `multipart.initGuard`. */
export type MultipartInitGuardContext = ObjectContext & {
  /** Declared byte size of the file — available during init only. */
  fileSize?: number;
  /** MIME type the client sent — not verified until `onComplete`. */
  contentType?: string;
  /** Custom object metadata. */
  metadata?: Record<string, string>;
  /** Resolved ACL that will be applied at init. */
  acl?: S3ObjectAcl;
  /** Original filename for `Content-Disposition`. */
  fileName?: string;
};

/** Context for `multipart.partGuard`. */
export type MultipartPartGuardContext = MultipartUploadContext & {
  /** 1-based part number. */
  partNumber: number;
  /** Byte size locked into the presigned URL signature. */
  partSize?: number;
};

/** Context for `multipart.completeGuard`. */
export type MultipartCompleteGuardContext = MultipartUploadContext & {
  /** Parts to assemble. */
  parts: MultipartCompletedPartRef[];
};

/** Context for `multipart.abortGuard`. */
export type MultipartAbortGuardContext = MultipartUploadContext;

/** Context for `multipart.listGuard`. */
export type MultipartListGuardContext = MultipartUploadContext;

/** Context for `multipart.onInit`. */
export type MultipartOnInitContext = MultipartInitGuardContext & {
  /** Multipart upload ID. */
  uploadId: string;
};

/** Context for `multipart.onComplete`. */
export type MultipartOnCompleteContext = MultipartUploadContext & {
  /** Verified size in bytes. */
  contentLength: number;
  /** MIME type from HeadObject. */
  contentType?: string;
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

/** Context for `multipart.onAbort`. */
export type MultipartOnAbortContext = MultipartUploadContext;

/** Context for `multipart.onList`. */
export type MultipartOnListContext = MultipartUploadContext & {
  /** Parts already uploaded to S3. */
  parts: MultipartPartInfo[];
};
