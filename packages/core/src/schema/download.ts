import { z } from "zod";
import { optionalTrimmedString, trimmedString } from "./shared";

/** Query string — numbers arrive as strings. */
export const downloadQuerySchema = z.object({
  key: trimmedString,
  bucket: optionalTrimmedString,
  fileName: optionalTrimmedString,
  expiresIn: z.coerce.number().positive().optional(),
});
