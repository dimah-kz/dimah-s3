import { z } from "zod";
import { uploadBodySchema } from "./upload";
import { routeNameSchema, trimmedString } from "./shared";

export const multipartInitBodySchema = uploadBodySchema;

export const multipartSignPartBodySchema = z.strictObject({
  route: routeNameSchema,
  key: trimmedString,
  uploadId: trimmedString,
  partNumber: z.number().int().positive(),
  partSize: z.number().int().positive(),
});

export const multipartListPartsQuerySchema = z.object({
  route: routeNameSchema,
  key: trimmedString,
  uploadId: trimmedString,
});

export const multipartCompleteBodySchema = z.strictObject({
  route: routeNameSchema,
  key: trimmedString,
  uploadId: trimmedString,
  parts: z
    .array(z.strictObject({ partNumber: z.number().int().positive() }))
    .min(1),
});

export const multipartAbortBodySchema = z.strictObject({
  route: routeNameSchema,
  key: trimmedString,
  uploadId: trimmedString,
});
