import type * as z from "zod";
import type { ticketBodySchema, uploadBodySchema } from "@/schema/upload";
import type { downloadQuerySchema, fileQuerySchema } from "@/schema/download";
import type { deleteManyBodySchema, deleteQuerySchema } from "@/schema/delete";
import type { S3RouteName } from "./routes";
import type {
  multipartInitBodySchema,
  multipartSignPartBodySchema,
} from "@/schema/multipart";
import type { s3ObjectAclSchema } from "@/schema/shared";

export type { UploadPresignMethod } from "./upload-presign-method";

/** S3 object ACL. */
export type S3ObjectAcl = z.output<typeof s3ObjectAclSchema>;

/** Per-call options for {@link S3Api} methods in the browser. */
export type S3RequestOptions = {
  /** Aborts the request. */
  signal?: AbortSignal;
  /** Merged over the client headers. Per-call values win. */
  headers?: HeadersInit;
};

type Named<T> = Omit<T, "route"> & { route: S3RouteName };

/** Payload for {@link S3Api.upload}. */
export type UploadPayload = Named<z.output<typeof uploadBodySchema>>;

/**
 * Payload of every call that carries only an upload ticket:
 * {@link S3Api.confirm} and the multipart `listParts`, `complete` and
 * `abort`.
 */
export type TicketPayload = z.output<typeof ticketBodySchema>;

/** Payload for {@link S3Api.download}. */
export type DownloadPayload = Named<z.output<typeof downloadQuerySchema>>;

/** Query for the same-origin proxy download (`GET /file`). */
export type FilePayload = Named<z.output<typeof fileQuerySchema>>;

/** Payload for {@link S3Api.delete}. */
export type DeletePayload = Named<z.output<typeof deleteQuerySchema>>;

/** Payload for {@link S3Api.deleteMany}. */
export type DeleteManyPayload = Named<z.output<typeof deleteManyBodySchema>>;

/** Payload for {@link S3Api.multipart.init}. */
export type MultipartInitPayload = Named<
  z.output<typeof multipartInitBodySchema>
>;

/** Payload for {@link S3Api.multipart.signPart}. */
export type MultipartSignPartPayload = z.output<
  typeof multipartSignPartBodySchema
>;
