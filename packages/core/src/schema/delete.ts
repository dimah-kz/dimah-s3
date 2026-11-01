import * as z from "zod";
import { DELETE_MANY_MAX_KEYS } from "@/limits";
import { objectKeySchema, routeNameSchema } from "./shared";

export const deleteQuerySchema = z.strictObject({
  route: routeNameSchema,
  key: objectKeySchema,
});

export const deleteManyBodySchema = z.strictObject({
  route: routeNameSchema,
  keys: z.array(objectKeySchema).min(1).max(DELETE_MANY_MAX_KEYS),
});
