import * as z from "zod";

/** `params` bag on API error JSON. */
export const s3ErrorParamsSchema = z.record(
  z.string(),
  z.union([z.string(), z.number()]),
);

/**
 * better-fetch `errorSchema` — same `{ message, code?, params? }` body
 * better-call serializes from `APIError`.
 */
export const s3FetchErrorSchema = z.object({
  message: z.string(),
  code: z.string().optional(),
  params: s3ErrorParamsSchema.optional(),
});

export type S3FetchError = z.output<typeof s3FetchErrorSchema>;
