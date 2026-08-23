import { z } from "zod";
import { uploadBodySchema } from "./upload";
import {
  optionalExpiresInSchema,
  optionalTrimmedString,
  trimmedString,
} from "./shared";

export const multipartInitBodySchema = uploadBodySchema;

export const multipartSignPartBodySchema = z.object({
  key: trimmedString,
  uploadId: trimmedString,
  partNumber: z.number().int().positive(),
  partSize: z.number().positive().optional(),
  bucket: optionalTrimmedString,
  expiresIn: optionalExpiresInSchema,
});

export const multipartListPartsQuerySchema = z.object({
  key: trimmedString,
  uploadId: trimmedString,
  bucket: optionalTrimmedString,
});

export const multipartCompleteBodySchema = z.object({
  key: trimmedString,
  uploadId: trimmedString,
  parts: z.array(z.object({ partNumber: z.number().int().positive() })).min(1),
  bucket: optionalTrimmedString,
});

export const multipartAbortBodySchema = z.object({
  key: trimmedString,
  uploadId: trimmedString,
  bucket: optionalTrimmedString,
});
