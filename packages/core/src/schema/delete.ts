import { z } from "zod";
import { objectKeySchema, routeNameSchema } from "./shared";

export const deleteQuerySchema = z.strictObject({
  route: routeNameSchema,
  key: objectKeySchema,
});
