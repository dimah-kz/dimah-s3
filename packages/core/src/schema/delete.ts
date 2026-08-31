import { z } from "zod";
import { objectKeySchema, routeNameSchema } from "./shared";

export const DELETE_BATCH_MAX_KEYS = 100;

export const deleteQuerySchema = z.strictObject({
  route: routeNameSchema,
  key: objectKeySchema,
});

export const deleteBatchBodySchema = z.strictObject({
  route: routeNameSchema,
  keys: z.array(objectKeySchema).min(1).max(DELETE_BATCH_MAX_KEYS),
});
