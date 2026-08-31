import { z } from "zod";
import { downloadDispositionSchema } from "./catalog";
import {
  objectKeySchema,
  optionalTrimmedString,
  routeNameSchema,
} from "./shared";

/** Query for the same-origin proxy download (`GET /file`). */
export const fileQuerySchema = z.strictObject({
  route: routeNameSchema,
  key: objectKeySchema,
  fileName: optionalTrimmedString,
  disposition: downloadDispositionSchema.optional(),
});
