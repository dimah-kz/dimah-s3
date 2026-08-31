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
 * Input to `object` on upload / multipart init.
 * `clientMetadata` is what the client sent — it is not written to S3
 * unless `object` copies it into {@link ObjectInfo.metadata}.
 */
export type ObjectContext = {
  request: Request;
  route: string;
  file: ObjectFile;
  bucket: string;
  /**
   * Namespace this route writes under. `false` means keys are not nested
   * or checked against a prefix.
   */
  keyPrefix: string | false;
  clientMetadata?: Record<string, string>;
};

/** Server-owned S3 object identity from route `object`. */
export type ObjectInfo = {
  /**
   * Extra folder under the route {@link ObjectContext.keyPrefix}.
   * Nested as `{keyPrefix}/{prefix}/{uuid}/{name}` unless `keyPrefix` is
   * `false`. Ignored when {@link key} is set.
   */
  prefix?: string;
  /**
   * Object key, nested under {@link ObjectContext.keyPrefix} unless the
   * key is already inside that prefix or `keyPrefix` is `false`.
   * If omitted, `{keyPrefix|prefix}/{uuid}/{name}` is used.
   */
  key?: string;
  /** S3 user metadata (`x-amz-meta-*`). */
  metadata?: Record<string, string>;
  /** Override the route ACL for this object. */
  acl?: S3ObjectAcl;
};

/**
 * Context for `upload.guard`.
 * Runs on single-shot presign and multipart init.
 * Client-declared values are not verified by S3.
 */
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

/** Context for `upload.onPresigned` (single-shot only). */
export type UploadOnPresignedContext = UploadPresignGuardContext & {
  /** Presigned upload URL. */
  url: string;
  /** Validity in seconds. */
  expiresIn: number;
};

/**
 * Context for `upload.confirmGuard`.
 * Runs on single-shot confirm and multipart complete.
 */
export type UploadConfirmGuardContext = StoredObjectContext & {
  /** Present on multipart complete. */
  uploadId?: string;
  /** Parts to assemble. Present on multipart complete. */
  parts?: MultipartCompletedPartRef[];
};

/**
 * Context for `upload.onConfirmed`.
 * `contentLength` and `eTag` are verified by S3 via HeadObject.
 * Runs after single-shot confirm and multipart complete.
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
  /** Present after multipart complete. */
  uploadId?: string;
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

/** Context for `upload.multipart.onInit`. */
export type MultipartOnInitContext = UploadPresignGuardContext & {
  /** Multipart upload ID. */
  uploadId: string;
};

/**
 * Context for `upload.multipart.sessionGuard`.
 * Runs on part, list, and abort (init uses `upload.guard`; complete uses
 * `upload.confirmGuard`).
 */
export type MultipartSessionGuardContext =
  | (MultipartUploadContext & {
      action: "part";
      /** 1-based part number. */
      partNumber: number;
      /** Byte size locked into the presigned URL signature. */
      partSize: number;
    })
  | (MultipartUploadContext & { action: "list" })
  | (MultipartUploadContext & { action: "abort" });

/** Context for `upload.multipart.onAbort`. */
export type MultipartOnAbortContext = MultipartUploadContext;

/** Context for `upload.multipart.onList`. */
export type MultipartOnListContext = MultipartUploadContext & {
  /** Parts already uploaded to S3. */
  parts: MultipartPartInfo[];
};
