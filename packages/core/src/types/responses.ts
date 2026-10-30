import type { S3ErrorShape } from "@/error-codes";
import type {
  ConfirmPayload,
  DeleteManyPayload,
  DeletePayload,
  DownloadPayload,
  MultipartInitPayload,
  MultipartSignPartPayload,
  MultipartTicketPayload,
  S3ObjectAcl,
  S3RequestOptions,
  UploadPayload,
  UploadPresignMethod,
} from "./requests";
import type { RouteCatalogResponse } from "@/schema/catalog";
import type { ContentDispositionType } from "@/helpers/build-content-disposition";

/** Response from {@link S3Api.delete}. Delete is idempotent. */
export type DeleteResponse = {
  /** S3 object key. */
  key: string;
  /** Target bucket. */
  bucket: string;
};

/** Response from {@link S3Api.deleteMany}. */
export type DeleteManyResponse = {
  /** Keys that were deleted. */
  deleted: string[];
  /** Keys that failed, each with its error body. */
  failed: Array<{ key: string; error: S3ErrorShape }>;
};

/** Verified object metadata after confirm or multipart complete. */
export type ConfirmedObjectResponse = {
  /** S3 object key. */
  key: string;
  /** Target bucket. */
  bucket: string;
  /** Stored file name. */
  name?: string;
  /** Verified size in bytes, from HeadObject. */
  size: number;
  /** MIME type from HeadObject. */
  type?: string;
  /** ETag from HeadObject. */
  eTag?: string;
  /** S3 version ID. */
  versionId?: string;
  /** Last modified timestamp. */
  lastModified?: string;
  /** User metadata, without internal keys. */
  metadata: Record<string, string>;
  /** ACL from the upload policy (`upload.acl` / `object`). */
  acl?: S3ObjectAcl;
};

/** Response from {@link S3Api.confirm}. */
export type UploadConfirmResponse = ConfirmedObjectResponse;

type UploadPresignBase = {
  /** S3 object key. */
  key: string;
  /** Target bucket. */
  bucket: string;
  /** Presigned upload URL. */
  url: string;
  /** URL validity in seconds. */
  expiresIn: number;
  /** Upload ticket. Send it to {@link S3Api.confirm}. */
  ticket: string;
};

/** Presigned upload URL and method-specific fields. */
export type UploadPresignResponse = UploadPresignBase &
  (
    | {
        method: Extract<UploadPresignMethod, "POST">;
        /** Form fields. Append them to FormData before the file. */
        fields: Record<string, string>;
      }
    | {
        method: Extract<UploadPresignMethod, "PUT">;
        /** Send exactly these on the PUT, never `Content-Length` or `Host`. */
        headers: Record<string, string>;
      }
  );

/** Response from {@link S3Api.multipart.init}. The server picks the part layout. */
export type MultipartInitResponse = {
  /** S3 object key. */
  key: string;
  /** Target bucket. */
  bucket: string;
  /** S3 multipart upload ID. */
  uploadId: string;
  /** Upload ticket. Send it to every later multipart call. */
  ticket: string;
  /** Size of every part except the last, in bytes. */
  partSize: number;
  /** Number of parts to upload. */
  partCount: number;
  /** Every part must send a SHA-256 checksum. */
  checksum: boolean;
};

/** Presigned URL for a single multipart part. */
export type MultipartPartResponse = {
  /** Presigned PUT URL for this part. */
  url: string;
  /** 1-based part number. */
  partNumber: number;
  /** Exact byte size signed into this part's URL. */
  size: number;
  /** URL validity in seconds. */
  expiresIn: number;
  /** Send exactly these on the part PUT. */
  headers: Record<string, string>;
};

/** A part already uploaded in a multipart session. */
export type MultipartPartInfo = {
  /** 1-based part number. */
  partNumber: number;
  /** Part size in bytes. */
  size: number;
  /** Part ETag from S3. */
  eTag: string;
  /** Base64 SHA-256 of the part, when S3 stored one. */
  checksum?: string;
};

/** Response from {@link S3Api.multipart.listParts}. */
export type MultipartListPartsResponse = {
  parts: MultipartPartInfo[];
};

/** Response from {@link S3Api.multipart.complete}. */
export type MultipartCompleteResponse = ConfirmedObjectResponse & {
  uploadId: string;
};

/** Response from {@link S3Api.multipart.abort}. */
export type MultipartAbortResponse = {
  /** S3 object key. */
  key: string;
  /** Aborted multipart upload ID. */
  uploadId: string;
};

/** Presigned GET URL for download, or a same-origin proxy URL. */
export type DownloadPresignResponse = {
  /** S3 object key. */
  key: string;
  /** Target bucket. */
  bucket: string;
  /** Presigned URL, or the same-origin `/file` URL when `mode` is `"proxy"`. */
  url: string;
  /** How the browser fetches the object. */
  mode: "presign" | "proxy";
  /** Content-Disposition used on the signed or proxied GET. */
  disposition: ContentDispositionType;
  /** URL validity in seconds. Omitted in proxy mode. */
  expiresIn?: number;
};

/**
 * Presign API protocol shared by `@dimah-s3/react` hooks and `@dimah-s3/server`.
 *
 * Every method takes per-call `options` last. In the browser they are
 * {@link S3RequestOptions}. Implement with `createS3Client()` from
 * `@dimah-s3/core`, or with any custom backend.
 */
export type S3Api<O = S3RequestOptions> = {
  upload(payload: UploadPayload, options?: O): Promise<UploadPresignResponse>;
  confirm(payload: ConfirmPayload, options?: O): Promise<UploadConfirmResponse>;
  download(
    payload: DownloadPayload,
    options?: O,
  ): Promise<DownloadPresignResponse>;
  catalog(options?: O): Promise<RouteCatalogResponse>;
  delete(payload: DeletePayload, options?: O): Promise<DeleteResponse>;
  deleteMany(
    payload: DeleteManyPayload,
    options?: O,
  ): Promise<DeleteManyResponse>;
  multipart: {
    init(
      payload: MultipartInitPayload,
      options?: O,
    ): Promise<MultipartInitResponse>;
    signPart(
      payload: MultipartSignPartPayload,
      options?: O,
    ): Promise<MultipartPartResponse>;
    listParts(
      payload: MultipartTicketPayload,
      options?: O,
    ): Promise<MultipartListPartsResponse>;
    complete(
      payload: MultipartTicketPayload,
      options?: O,
    ): Promise<MultipartCompleteResponse>;
    abort(
      payload: MultipartTicketPayload,
      options?: O,
    ): Promise<MultipartAbortResponse>;
  };
};
