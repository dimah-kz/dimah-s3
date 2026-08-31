import { z } from "zod";
import { uploadBodySchema } from "./upload";
import {
  objectKeySchema,
  partNumberSchema,
  routeNameSchema,
  trimmedString,
} from "./shared";

export const multipartInitBodySchema = uploadBodySchema;

const multipartSessionFields = {
  route: routeNameSchema,
  key: objectKeySchema,
  uploadId: trimmedString,
};

export const multipartSignPartBodySchema = z.strictObject({
  ...multipartSessionFields,
  partNumber: partNumberSchema,
  partSize: z.number().int().positive(),
});

export const multipartListPartsQuerySchema = z.strictObject({
  ...multipartSessionFields,
});

export const multipartCompletedPartSchema = z.strictObject({
  partNumber: partNumberSchema,
});

export const multipartCompleteBodySchema = z.strictObject({
  ...multipartSessionFields,
  parts: z.array(multipartCompletedPartSchema).min(1),
});

export const multipartAbortBodySchema = z.strictObject({
  ...multipartSessionFields,
});
