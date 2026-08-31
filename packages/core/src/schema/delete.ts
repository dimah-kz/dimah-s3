import { z } from "zod";
import { routeNameSchema, trimmedString } from "./shared";

export const deleteQuerySchema = z.object({
  route: routeNameSchema,
  key: trimmedString,
});
