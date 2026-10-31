import {
  fileNameSchema,
  objectKeySchema,
  optionalContentTypeSchema,
  optionalTrimmedString,
  routeNameSchema,
  trimmedString,
} from "@dimah-s3/core";
import * as z from "zod";
import { DEFAULT_LIST_LIMIT } from "@/store/object-store";

/** Most rows one page of `GET /db/objects` returns. */
export const DB_LIST_MAX_LIMIT = 100;

/** Longest `search` text, in characters. */
const MAX_SEARCH_LENGTH = 255;

/** Longest `cursor`, in characters. Real cursors are far shorter. */
const MAX_CURSOR_LENGTH = 2048;

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

export const dbListSortSchema = z.object({
  field: z.enum(["createdAt", "updatedAt", "size", "filename"]),
  direction: z.enum(["asc", "desc"]),
});

/**
 * A query string carries `sort` as JSON (better-fetch serializes objects
 * that way); `s3.api` may pass the object.
 */
const dbListSortQuerySchema = z.codec(
  z.union([z.string(), dbListSortSchema]),
  dbListSortSchema,
  {
    decode: (value, ctx) => {
      if (typeof value !== "string") return value;
      try {
        return JSON.parse(value) as z.input<typeof dbListSortSchema>;
      } catch {
        ctx.issues.push({
          code: "invalid_format",
          format: "json",
          input: value,
          message: "Invalid sort",
        });
        return z.NEVER;
      }
    },
    encode: (value) => value,
  },
);

/**
 * Query of `GET /db/objects`. `folder` is a wire folder (`""` is the root)
 * that the endpoint validates, so a bad path is `FOLDER_INVALID`. Blank
 * `search`, `contentType`, and `cursor` values are omitted.
 */
export const dbListQuerySchema = z.strictObject({
  folder: z.string().optional(),
  route: routeNameSchema.optional(),
  status: z.enum(["pending", "active", "deleted", "purging"]).optional(),
  contentType: optionalContentTypeSchema,
  /** Text the filename contains. */
  search: optionalTrimmedString.pipe(
    z.string().max(MAX_SEARCH_LENGTH).optional(),
  ),
  sort: dbListSortQuerySchema.optional(),
  limit: queryInt(z.int().min(1).max(DB_LIST_MAX_LIMIT)).default(
    DEFAULT_LIST_LIMIT,
  ),
  cursor: optionalTrimmedString.pipe(
    z.string().max(MAX_CURSOR_LENGTH).optional(),
  ),
});

/** Query of `GET /db/object`. */
export const dbObjectQuerySchema = z.strictObject({
  key: objectKeySchema,
  bucket: trimmedString.optional(),
});

/**
 * Body of `PATCH /db/object`. `folder` is validated by the endpoint; `null`
 * and `""` are the root. `attributes` are checked by the plugin's
 * `attributes.schema`.
 */
export const dbUpdateObjectBodySchema = z.strictObject({
  key: objectKeySchema,
  bucket: trimmedString.optional(),
  filename: fileNameSchema.optional(),
  folder: z.string().nullable().optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Body of `POST /db/folder` and query of `DELETE /db/folder`. The endpoint
 * validates `path`, so a bad path is `FOLDER_INVALID`.
 */
export const dbFolderInputSchema = z.strictObject({
  path: z.string(),
});
