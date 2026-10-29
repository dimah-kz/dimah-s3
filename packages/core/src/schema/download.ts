import * as z from "zod";
import { downloadDispositionSchema } from "./catalog";
import {
  objectKeySchema,
  optionalTrimmedString,
  routeNameSchema,
  S3_MAX_EXPIRES_IN,
} from "./shared";

/**
 * Positive TTL in seconds. Query strings arrive as digits; blank is omitted.
 * Values above the SigV4 maximum are rejected. The route cap is applied later.
 */
const optionalExpiresInSchema = z.preprocess((value: unknown) => {
  if (value == null || value === "") return undefined;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return undefined;
    if (/^\d+$/.test(trimmed)) return Number(trimmed);
  }
  return value;
}, z.int().positive().max(S3_MAX_EXPIRES_IN).optional());

/** Query string — numbers arrive as strings. Extra keys are rejected. */
export const downloadQuerySchema = z.strictObject({
  route: routeNameSchema,
  key: objectKeySchema,
  fileName: optionalTrimmedString,
  disposition: downloadDispositionSchema.optional(),
  /**
   * Requested TTL in seconds. Signed only when it is shorter than the
   * route `download.expiresIn`. `download.resolve` can still replace it.
   */
  expiresIn: optionalExpiresInSchema,
});
