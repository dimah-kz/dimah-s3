import { z } from "zod";
import { metadataSchema, optionalTrimmedString, routeNameSchema } from "./shared";

export const uploadBodySchema = z.object({
  route: routeNameSchema,
  fileName: z.string().trim().min(1),
  fileSize: z.number().positive(),
  contentType: optionalTrimmedString,
  metadata: metadataSchema.optional(),
});

export const confirmBodySchema = z.object({
  route: routeNameSchema,
  key: z.string().trim().min(1),
});
