import * as z from "zod";

/** `params` bag on API error JSON. */
export const s3ErrorParamsSchema = z.record(
  z.string(),
  z.union([z.string(), z.number()]),
);

function isParamValue(value: unknown): value is string | number {
  return typeof value === "string" || typeof value === "number";
}

/**
 * Lenient `params` for a received body: keeps the string and number
 * entries and drops the rest, so one odd value never costs the error its
 * `code`. Omitted when nothing is left.
 */
const receivedParamsSchema = z.unknown().transform((value) => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const entries = Object.entries(value).filter(
    (entry): entry is [string, string | number] => isParamValue(entry[1]),
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
});

/**
 * better-fetch `errorSchema`. Matches the `{ code, message, params? }` body
 * that every API error response carries. `code` and `message` are required;
 * `params` values that are not strings or numbers are dropped.
 */
export const s3FetchErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  params: receivedParamsSchema.optional(),
});

export type S3FetchError = z.output<typeof s3FetchErrorSchema>;
