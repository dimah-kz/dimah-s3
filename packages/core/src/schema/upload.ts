import * as z from "zod";
import { S3_MAX_OBJECT_SIZE } from "@/limits";
import {
  fileNameSchema,
  metadataSchema,
  optionalChecksumSchema,
  optionalContentTypeSchema,
  routeNameSchema,
  uploadTicketSchema,
} from "./shared";

export const uploadBodySchema = z.strictObject({
  route: routeNameSchema,
  name: fileNameSchema,
  /**
   * Declared size in bytes. Confirm checks it against HeadObject. `0` parses
   * so the server can reject it as `FILE_EMPTY`, as `validateFile` does.
   */
  size: z.int().nonnegative().max(S3_MAX_OBJECT_SIZE),
  /** MIME type. A blank value is omitted. */
  type: optionalContentTypeSchema,
  metadata: metadataSchema.optional(),
  /**
   * Base64 SHA-256 (padding optional), as `sha256Blob` / `sha256Base64`
   * return it. Required when the route sets `upload.checksum`.
   */
  checksum: optionalChecksumSchema,
});

/**
 * Body of every call that carries only an upload ticket: confirm, and the
 * multipart `listParts`, `complete` and `abort`.
 */
export const ticketBodySchema = z.strictObject({
  ticket: uploadTicketSchema,
});
