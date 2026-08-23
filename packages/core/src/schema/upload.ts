import { z } from "zod";
import {
  metadataSchema,
  optionalExpiresInSchema,
  optionalTrimmedString,
  s3ObjectAclSchema,
  trimmedString,
} from "./shared";

export const uploadBodySchema = z.object({
  key: trimmedString,
  contentType: optionalTrimmedString,
  fileSize: z.number().positive().optional(),
  metadata: metadataSchema.optional(),
  bucket: optionalTrimmedString,
  expiresIn: optionalExpiresInSchema,
  acl: s3ObjectAclSchema.optional(),
  fileName: optionalTrimmedString,
});

export const confirmBodySchema = z.object({
  key: trimmedString,
  bucket: optionalTrimmedString,
});
