import type * as z from "zod";
import type { confirmBodySchema, uploadBodySchema } from "@/schema/upload";
import type { downloadQuerySchema } from "@/schema/download";
import type { deleteBatchBodySchema, deleteQuerySchema } from "@/schema/delete";
import type { fileQuerySchema } from "@/schema/file";
import type { S3RouteName } from "./routes";
import type {
  multipartAbortBodySchema,
  multipartCompleteBodySchema,
  multipartCompletedPartSchema,
  multipartInitBodySchema,
  multipartListPartsQuerySchema,
  multipartSignPartBodySchema,
} from "@/schema/multipart";
import type { s3ObjectAclSchema } from "@/schema/shared";

export type { UploadPresignMethod } from "./upload-presign-method";

/** S3 object ACL. */
export type S3ObjectAcl = z.output<typeof s3ObjectAclSchema>;

/**
 * Server-side auth context for `dimahS3().api` calls (guards / db scope).
 * Ignored by {@link createS3Client} — never sent over the wire.
 */
export type S3ApiHeaders = {
  /** Forwarded into a synthetic `Request` for server-side `api` calls. */
  headers?: HeadersInit;
};

type WithNamedRoute<T> = Omit<T, "route"> & {
  route: S3RouteName;
} & S3ApiHeaders;

/** Payload for {@link S3Api.upload}. */
export type UploadPayload = WithNamedRoute<z.output<typeof uploadBodySchema>>;

/** Payload for {@link S3Api.confirm}. */
export type ConfirmPayload = WithNamedRoute<z.output<typeof confirmBodySchema>>;

/** Payload for {@link S3Api.download}. */
export type DownloadPayload = WithNamedRoute<
  z.output<typeof downloadQuerySchema>
>;

/** Payload for {@link S3Api.delete}. */
export type DeletePayload = WithNamedRoute<z.output<typeof deleteQuerySchema>>;

/** Payload for {@link S3Api.deleteMany}. */
export type DeleteBatchPayload = WithNamedRoute<
  z.output<typeof deleteBatchBodySchema>
>;

/** Payload for {@link S3Api.file} (proxy download query). */
export type FilePayload = WithNamedRoute<z.output<typeof fileQuerySchema>>;

/** Payload for {@link S3Api.multipart.init}. */
export type MultipartInitPayload = WithNamedRoute<
  z.output<typeof multipartInitBodySchema>
>;

/** Payload for {@link S3Api.multipart.signPart}. */
export type MultipartSignPartPayload = WithNamedRoute<
  z.output<typeof multipartSignPartBodySchema>
>;

/** Payload for {@link S3Api.multipart.listParts}. */
export type MultipartListPartsPayload = WithNamedRoute<
  z.output<typeof multipartListPartsQuerySchema>
>;

/** A completed multipart part reference for {@link S3Api.multipart.complete}. */
export type MultipartCompletedPartRef = z.output<
  typeof multipartCompletedPartSchema
>;

/** Payload for {@link S3Api.multipart.complete}. */
export type MultipartCompletePayload = WithNamedRoute<
  z.output<typeof multipartCompleteBodySchema>
>;

/** Payload for {@link S3Api.multipart.abort}. */
export type MultipartAbortPayload = WithNamedRoute<
  z.output<typeof multipartAbortBodySchema>
>;
