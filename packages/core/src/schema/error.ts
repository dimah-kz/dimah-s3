import * as z from "zod";

/** `params` bag on API error JSON. */
export const s3ErrorParamsSchema = z.record(
  z.string(),
  z.union([z.string(), z.number()]),
);

/**
 * better-fetch `errorSchema`. Matches the `{ code, message, params? }` body
 * that every API error response carries.
 */
export const s3FetchErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  params: s3ErrorParamsSchema.optional(),
});

export type S3FetchError = z.output<typeof s3FetchErrorSchema>;
