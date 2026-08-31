import { z } from "zod";
import { routeNameSchema } from "@dimah-s3/core";

export const DB_LIST_DEFAULT_LIMIT = 50;
export const DB_LIST_MAX_LIMIT = 100;

export const dbListQuerySchema = z.object({
  status: z.enum(["pending", "active", "deleted"]).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(DB_LIST_MAX_LIMIT)
    .default(DB_LIST_DEFAULT_LIMIT),
  offset: z.coerce.number().int().nonnegative().optional(),
  cursor: z.string().min(1).optional(),
  route: routeNameSchema.optional(),
  contentType: z.string().min(1).optional(),
  prefix: z.string().min(1).optional(),
});

export const dbGetQuerySchema = z.object({
  key: z.string().min(1),
  bucket: z.string().min(1).optional(),
});
