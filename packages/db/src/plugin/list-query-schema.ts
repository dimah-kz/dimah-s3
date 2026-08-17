import { z } from "zod";

export const dbListQuerySchema = z.object({
  status: z.enum(["pending", "active", "deleted"]).optional(),
  limit: z.coerce.number().int().nonnegative().optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});
