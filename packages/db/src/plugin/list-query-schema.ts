import * as z from "zod";
import { routeNameSchema, trimmedString } from "@dimah-s3/core";

export const DB_LIST_DEFAULT_LIMIT = 50;
export const DB_LIST_MAX_LIMIT = 100;

/**
 * Query-string integers arrive as strings; `s3.api` may pass numbers.
 * A codec stays compilable (`z.coerce` is not).
 */
function queryInt(schema: z.ZodInt) {
  return z.codec(
    z.union([z.string().trim().regex(z.regexes.integer), schema]),
    schema,
    {
      decode: (value) =>
        typeof value === "number" ? value : Number.parseInt(value, 10),
      encode: (value) => value,
    },
  );
}

export const dbListQuerySchema = z.object({
  status: z.enum(["pending", "active", "deleted"]).optional(),
  limit: queryInt(z.int().min(1).max(DB_LIST_MAX_LIMIT)).default(
    DB_LIST_DEFAULT_LIMIT,
  ),
  offset: queryInt(z.int().nonnegative()).optional(),
  cursor: trimmedString.optional(),
  route: routeNameSchema.optional(),
  contentType: trimmedString.optional(),
  prefix: trimmedString.optional(),
});

export const dbGetQuerySchema = z.object({
  key: trimmedString,
  bucket: trimmedString.optional(),
});
