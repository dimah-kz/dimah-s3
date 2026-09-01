import * as z from "zod";
import {
  metadataSchema,
  objectKeySchema,
  optionalChecksumSchema,
  optionalTrimmedString,
  routeNameSchema,
  trimmedString,
} from "./shared";

export const uploadBodySchema = z.strictObject({
  route: routeNameSchema,
  fileName: trimmedString,
  fileSize: z.int().positive(),
  contentType: optionalTrimmedString,
  metadata: metadataSchema.optional(),
  /** Unpadded base64 SHA-256. Required when the route sets `upload.checksum`. */
  checksum: optionalChecksumSchema,
});

export const confirmBodySchema = z.strictObject({
  route: routeNameSchema,
  key: objectKeySchema,
});
