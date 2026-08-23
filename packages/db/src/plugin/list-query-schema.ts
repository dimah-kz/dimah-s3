import { z } from "zod";

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
});
