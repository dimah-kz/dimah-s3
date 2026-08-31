import type { z } from "zod";
import type { confirmBodySchema, uploadBodySchema } from "@/schema/upload";
import type { downloadQuerySchema } from "@/schema/download";
import type { deleteQuerySchema } from "@/schema/delete";
import type {
  multipartAbortBodySchema,
  multipartCompleteBodySchema,
  multipartInitBodySchema,
  multipartListPartsQuerySchema,
  multipartSignPartBodySchema,
} from "@/schema/multipart";
import type { s3ObjectAclSchema } from "@/schema/shared";

export type { UploadPresignMethod } from "./upload-presign-method";

/** S3 object ACL. */
export type S3ObjectAcl = z.infer<typeof s3ObjectAclSchema>;

/**
 * Server-side auth context for `dimahS3().api` calls (guards / db scope).
 * Ignored by {@link createS3Client} — never sent over the wire.
 */
export type S3ApiHeaders = {
  /** Forwarded into a synthetic `Request` for server-side `api` calls. */
  headers?: HeadersInit;
};

/** Payload for {@link S3Api.upload}. */
export type UploadPayload = z.infer<typeof uploadBodySchema> & S3ApiHeaders;

/** Payload for {@link S3Api.confirm}. */
export type ConfirmPayload = z.infer<typeof confirmBodySchema> & S3ApiHeaders;

/** Payload for {@link S3Api.download}. */
export type DownloadPayload = z.infer<typeof downloadQuerySchema> &
  S3ApiHeaders;

/** Payload for {@link S3Api.delete}. */
export type DeletePayload = z.infer<typeof deleteQuerySchema> & S3ApiHeaders;

/** Payload for {@link S3Api.multipart.init}. */
export type MultipartInitPayload = z.infer<typeof multipartInitBodySchema> &
  S3ApiHeaders;

/** Payload for {@link S3Api.multipart.signPart}. */
export type MultipartSignPartPayload = z.infer<
  typeof multipartSignPartBodySchema
> &
  S3ApiHeaders;

/** Payload for {@link S3Api.multipart.listParts}. */
export type MultipartListPartsPayload = z.infer<
  typeof multipartListPartsQuerySchema
> &
  S3ApiHeaders;

/** A completed multipart part reference for {@link S3Api.multipart.complete}. */
export type MultipartCompletedPartRef = {
  /** 1-based part number. */
  partNumber: number;
};

/** Payload for {@link S3Api.multipart.complete}. */
export type MultipartCompletePayload = z.infer<
  typeof multipartCompleteBodySchema
> &
  S3ApiHeaders;

/** Payload for {@link S3Api.multipart.abort}. */
export type MultipartAbortPayload = z.infer<typeof multipartAbortBodySchema> &
  S3ApiHeaders;
