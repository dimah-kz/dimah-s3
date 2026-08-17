import { z } from "zod";
import { optionalTrimmedString, trimmedString } from "./shared";

export const deleteQuerySchema = z.object({
  key: trimmedString,
  bucket: optionalTrimmedString,
});
