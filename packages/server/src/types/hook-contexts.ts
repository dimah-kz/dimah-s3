import type {
  MultipartCompletedPartRef,
  MultipartPartInfo,
  S3ObjectAcl,
} from "@dimah-s3/core";

/** Context for the instance `guard` hook. */
export type GuardContext = {
  /** The incoming HTTP request. */
  request: Request;
};

/** Context for a route-level `guard` (every operation on that route). */
export type RouteGuardContext = GuardContext & {
  /** Named file route. */
  route: string;
};

type StoredObjectContext = RouteGuardContext & {
  /** S3 object key. */
  key: string;
  /** Target bucket. */
  bucket: string;
};

/** Declared file on upload / multipart init. */
export type ObjectFile = {
  name: string;
  size?: number;
  type?: string;
};

/**
 * Input to `prefix` and `object` on upload / multipart init.
 * `clientMetadata` is what the client sent — it is not written to S3
 * unless `object` copies it into {@link ObjectInfo.metadata}.
 */
export type ObjectContext = {
  request: Request;
  route: string;
  file: ObjectFile;
  bucket: string;
  clientMetadata?: Record<string, string>;
};

/** Server-owned S3 object identity from route `object`. */
export type ObjectInfo = {
  /** Full object key. If omitted, `prefix` / `{route}/{uuid}/{name}` is used. */
  key?: string;
  /** S3 user metadata (`x-amz-meta-*`). */
  metadata?: Record<string, string>;
  /** Override the route ACL for this object. */
  acl?: S3ObjectAcl;
};

/** Context for `upload.guard`. Client-declared values are not verified by S3. */
export type UploadPresignGuardContext = StoredObjectContext & {
  /** MIME type the client sent — not verified until `onConfirmed`. */
  contentType?: string;
  /** Size the client sent — not verified until `onConfirmed`. */
  fileSize?: number;
  /** S3 object metadata from route `object`. */
  metadata?: Record<string, string>;
  /** Client extras from the request — not written to S3 automatically. */
  clientMetadata?: Record<string, string>;
  /** Resolved ACL. */
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
export type UploadConfirmGuardContext = StoredObjectContext;

/**
 * Context for `upload.onConfirmed`.
 * `contentLength` and `eTag` are verified by S3 via HeadObject.
 */
export type UploadOnConfirmedContext = RouteGuardContext & {
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
export type DownloadPresignGuardContext = StoredObjectContext & {
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
export type DeleteGuardContext = StoredObjectContext;

/** Context for `delete.onDeleted`. */
export type DeleteOnDeletedContext = StoredObjectContext;

/** Shared base for multipart operations that already have an upload id. */
export type MultipartUploadContext = StoredObjectContext & {
  /** Multipart upload ID. */
  uploadId: string;
};

/** Context for `multipart.initGuard`. */
export type MultipartInitGuardContext = StoredObjectContext & {
  /** Declared byte size of the file — available during init only. */
  fileSize?: number;
  /** MIME type the client sent — not verified until `onComplete`. */
  contentType?: string;
  /** S3 object metadata from route `object`. */
  metadata?: Record<string, string>;
  /** Client extras from the request — not written to S3 automatically. */
  clientMetadata?: Record<string, string>;
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
