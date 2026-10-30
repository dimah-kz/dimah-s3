import * as z from "zod";
import { uploadBodySchema } from "./upload";
import {
  optionalChecksumSchema,
  partNumberSchema,
  uploadTicketSchema,
} from "./shared";

/** Same fields as upload, minus `checksum`. The server picks the part layout. */
export const multipartInitBodySchema = uploadBodySchema.omit({
  checksum: true,
});

export const multipartSignPartBodySchema = z.strictObject({
  ticket: uploadTicketSchema,
  partNumber: partNumberSchema,
  /**
   * Base64 SHA-256 of the part (padding optional), as `sha256Blob` /
   * `sha256Base64` return it. Required when init returned `checksum: true`.
   */
  checksum: optionalChecksumSchema,
});

/** Body for `listParts`, `complete`, and `abort`. */
export const multipartTicketBodySchema = z.strictObject({
  ticket: uploadTicketSchema,
});
