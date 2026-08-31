import { z } from "zod";
import {
  optionalTrimmedString,
  routeNameSchema,
  trimmedString,
} from "./shared";

/** Query string — numbers arrive as strings. */
export const downloadQuerySchema = z.object({
  route: routeNameSchema,
  key: trimmedString,
  fileName: optionalTrimmedString,
});
