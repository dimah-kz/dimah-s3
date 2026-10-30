import * as z from "zod";
import { objectKeySchema, routeNameSchema } from "./shared";

/** Most keys one `deleteMany` request may carry. */
export const DELETE_MANY_MAX_KEYS = 100;

export const deleteQuerySchema = z.strictObject({
  route: routeNameSchema,
  key: objectKeySchema,
});

export const deleteManyBodySchema = z.strictObject({
  route: routeNameSchema,
  keys: z.array(objectKeySchema).min(1).max(DELETE_MANY_MAX_KEYS),
});
