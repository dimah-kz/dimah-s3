import type { ContentDispositionType, S3ObjectAcl } from "@dimah-s3/core";
import type { DimahS3Locals } from "./locals";

/** The call a hook runs in. Plugin endpoints use `"plugin"`. */
export type S3Operation =
  | "upload"
  | "confirm"
  | "download"
  | "file"
  | "delete"
  | "deleteMany"
  | "catalog"
  | "put"
  | "multipart.init"
  | "multipart.signPart"
  | "multipart.listParts"
  | "multipart.complete"
  | "multipart.abort"
  | "plugin";

/**
 * How the bytes reach S3: a presigned POST or PUT, a multipart upload, or
 * `s3.put` on the server.
 */
export type UploadKind = "post" | "put" | "multipart" | "server";

/** Context for the instance `guard`. Every other context extends it. */
export type GuardContext = {
  /** The incoming request, or a synthetic one for in-process calls. */
  request: Request;
  operation: S3Operation;
  /** Values from earlier guards in this call. See {@link DimahS3Locals}. */
  locals: DimahS3Locals;
};

/** Context for a route `guard`. It runs before every operation on the route. */
export type RouteGuardContext = GuardContext & {
  /** Named file route. */
  route: string;
};

/** Shared context once the object key is known. */
export type ObjectContext = RouteGuardContext & {
  /** S3 object key. */
  key: string;
  bucket: string;
};

/** File the client declared. S3 has not verified it yet. */
export type UploadFile = {
  name: string;
  size: number;
  type?: string;
};

/**
 * Input to `upload.object`. `clientMetadata` is what the client sent; it is
 * written to S3 only when `object` copies it into
 * {@link UploadObjectInfo.metadata}.
 */
export type UploadObjectContext = RouteGuardContext & {
  file: UploadFile;
  bucket: string;
  /**
   * Namespace this route writes under. With `false`, the default key is
   * `{uuid}/{name}` and follow-up keys are not namespace-checked.
   */
  keyPrefix: string | false;
  clientMetadata?: Record<string, string>;
};

/** Server-owned object identity from `upload.object`. */
export type UploadObjectInfo = {
  /**
   * Key path segment under the route `keyPrefix`:
   * `{keyPrefix}/{keyFolder}/{uuid}/{name}`. Ignored when {@link key} is set.
   */
  keyFolder?: string;
  /**
   * Object key, nested under the route `keyPrefix` unless it is already
   * inside it or `keyPrefix` is `false`.
   */
  key?: string;
  /**
   * S3 user metadata (`x-amz-meta-*`). Non-ASCII values are RFC 2047-encoded.
   * Keys and values, including internal keys, are limited to 2048 UTF-8
   * bytes in total.
   */
  metadata?: Record<string, string>;
  /** Overrides the route ACL for this object. */
  acl?: S3ObjectAcl;
  /** S3 storage class (`STANDARD_IA`, `INTELLIGENT_TIERING`, …). Signed. */
  storageClass?: string;
  /** `Cache-Control` written on the object. Signed. */
  cacheControl?: string;
  /**
   * S3 object tags (at most 10), printable ASCII only. Signed, and visible
   * to the client on presigned uploads, so keep secrets out.
   */
  tagging?: Record<string, string>;
  /**
   * Key to delete after a successful confirm. It must stay under the route
   * `keyPrefix`. Use it with a new key to replace an avatar.
   */
  previousKey?: string;
};

/** S3 headers from `upload.object` that are signed into the upload. */
export type ObjectS3Headers = Pick<
  UploadObjectInfo,
  "storageClass" | "cacheControl" | "tagging"
>;

/**
 * Context for `upload.guard`. It runs on presign, multipart init and
 * `s3.put`, after `upload.object`, so `key` is already assigned.
 */
export type UploadGuardContext = ObjectContext &
  ObjectS3Headers & {
    kind: UploadKind;
    file: UploadFile;
    acl: S3ObjectAcl;
    /** S3 metadata from `upload.object`. */
    metadata?: Record<string, string>;
    /** Client extras. They are never written to S3 automatically. */
    clientMetadata?: Record<string, string>;
  };

/**
 * Context for `upload.onStart`. It runs once the upload can begin: after
 * presign, after `CreateMultipartUpload`, or before `PutObject` for
 * `s3.put`. A throw cancels the upload.
 */
export type UploadOnStartContext = UploadGuardContext & {
  /** Stable id of this upload. Dedupe `onConfirmed` replays on it. */
  uploadToken: string;
  /** Multipart only. */
  uploadId?: string;
  /** Presigned URL. POST and PUT only. */
  url?: string;
  /** When the presigned URL expires. POST and PUT only. */
  urlExpiresAt?: Date;
  /** Confirm deadline: the ticket expiry, or 15 minutes for `s3.put`. */
  expiresAt: Date;
};

/** Object as HeadObject reports it. Trust these values, not the declared file. */
export type VerifiedObject = {
  name?: string;
  size: number;
  type?: string;
  eTag?: string;
  versionId?: string;
  lastModified?: string;
  /** User metadata, decoded, without internal keys. */
  metadata: Record<string, string>;
};

/**
 * Context for `upload.confirmGuard`. It runs on confirm and multipart
 * complete, after HeadObject and the size, type and content checks, so
 * `object` holds the values S3 verified. A rejection deletes the object.
 */
export type UploadConfirmGuardContext = ObjectContext & {
  kind: Exclude<UploadKind, "server">;
  uploadToken: string;
  /** Multipart only. */
  uploadId?: string;
  /** File declared at presign or init. Check `object` instead. */
  file: UploadFile;
  /** ACL from the upload policy. */
  acl: S3ObjectAcl;
  /** The object as HeadObject reports it. */
  object: VerifiedObject;
};

/**
 * Context for `upload.onConfirmed`: the confirm guard context, and also for
 * `s3.put` (`kind: "server"`). It runs at least once per upload; a retried
 * confirm runs it again, so dedupe on `uploadToken`.
 */
export type UploadOnConfirmedContext = Omit<
  UploadConfirmGuardContext,
  "kind"
> & {
  kind: UploadKind;
  /**
   * `upload.object().previousKey`, which is deleted once every
   * `onConfirmed` hook succeeds. Retire your own record of it here.
   */
  previousKey?: string;
};

/** Context for `download.resolve`. */
export type DownloadResolveContext = ObjectContext & {
  mode: "presign" | "proxy";
  /** Download file name the client asked for. */
  name?: string;
  /** Requested disposition, or the route default. */
  disposition: ContentDispositionType;
  /** TTL the client asked for. Presign mode only. */
  expiresIn?: number;
};

/** Per-request download options from `download.resolve`. */
export type DownloadResolveInfo = {
  name?: string;
  disposition?: ContentDispositionType;
  /** Signed TTL in seconds, capped by the instance `maxExpiresIn`. Presign mode only. */
  expiresIn?: number;
  /** `Cache-Control` on `/file` responses. Proxy mode only. @default "private, no-cache" */
  cacheControl?: string;
};

/** Context for `download.guard`, with the values that will be used. */
export type DownloadGuardContext = ObjectContext & {
  mode: "presign" | "proxy";
  name?: string;
  disposition: ContentDispositionType;
  /** Signed TTL. `undefined` in proxy mode. */
  expiresIn?: number;
};

/** Context for `download.onPresigned`. */
export type DownloadOnPresignedContext = DownloadGuardContext & {
  /** Presigned GET URL, or the `/file` URL in proxy mode. */
  url: string;
};

/** Context for `delete.guard`. */
export type DeleteGuardContext = ObjectContext;

/**
 * Context for `delete.onDeleted`. Delete is idempotent, so this also runs
 * when the object did not exist.
 */
export type DeleteOnDeletedContext = ObjectContext;

/** Shared context for multipart calls that carry a ticket. */
export type MultipartUploadContext = ObjectContext & {
  uploadId: string;
  uploadToken: string;
  /** File declared at init. */
  file: UploadFile;
};

/**
 * Context for `upload.multipart.guard`. It runs on part signing, list,
 * abort and complete. Init uses `upload.guard`.
 */
export type MultipartGuardContext =
  | (MultipartUploadContext & {
      action: "part";
      /** 1-based part number. */
      partNumber: number;
      /** Byte size signed into the part URL. */
      size: number;
    })
  | (MultipartUploadContext & { action: "list" | "abort" | "complete" });

/** Context for `upload.multipart.onAbort`. */
export type MultipartOnAbortContext = MultipartUploadContext;
