import * as z from "zod";
import { S3_MAX_EXPIRES_IN } from "@/limits";
import { downloadDispositionSchema } from "./catalog";
import {
  objectKeySchema,
  optionalFileNameSchema,
  routeNameSchema,
} from "./shared";

/** A blank query value, which the optional fields below omit. */
function blankToUndefined(value: unknown): unknown {
  if (value == null) return undefined;
  if (typeof value === "string" && value.trim() === "") return undefined;
  return value;
}

/**
 * Positive TTL in seconds. Query strings arrive as digits; blank is omitted.
 * Values above the SigV4 maximum are rejected. The route cap is applied later.
 */
const optionalExpiresInSchema = z.preprocess((value: unknown) => {
  const present = blankToUndefined(value);
  if (typeof present === "string" && /^\d+$/.test(present.trim())) {
    return Number(present.trim());
  }
  return present;
}, z.int().positive().max(S3_MAX_EXPIRES_IN).optional());

/** `inline` or `attachment`. A blank value is omitted, like the other fields. */
const optionalDispositionSchema = z.preprocess(
  blankToUndefined,
  downloadDispositionSchema.optional(),
);

/** Query string — numbers arrive as strings. Extra keys are rejected. */
export const downloadQuerySchema = z.strictObject({
  route: routeNameSchema,
  key: objectKeySchema,
  /** Download file name. A blank value is omitted. */
  name: optionalFileNameSchema,
  disposition: optionalDispositionSchema,
  /**
   * Requested TTL in seconds. Capped by the route `download.maxExpiresIn`.
   * `download.resolve` can still replace it.
   */
  expiresIn: optionalExpiresInSchema,
});

/**
 * Query for the same-origin proxy download (`GET /file`): the download
 * query without `expiresIn`, since a proxy URL does not expire.
 */
export const fileQuerySchema = downloadQuerySchema.omit({ expiresIn: true });
