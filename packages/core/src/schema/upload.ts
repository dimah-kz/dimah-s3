import { z } from "zod";
import {
  metadataSchema,
  optionalTrimmedString,
  routeNameSchema,
} from "./shared";

export const uploadBodySchema = z.strictObject({
  route: routeNameSchema,
  fileName: z.string().trim().min(1),
  fileSize: z.number().int().positive(),
  contentType: optionalTrimmedString,
  metadata: metadataSchema.optional(),
});

export const confirmBodySchema = z.strictObject({
  route: routeNameSchema,
  key: z.string().trim().min(1),
});
