import * as z from "zod";
import { downloadDispositionSchema } from "./catalog";
import {
  objectKeySchema,
  optionalFileNameSchema,
  routeNameSchema,
} from "./shared";

/** Query for the same-origin proxy download (`GET /file`). */
export const fileQuerySchema = z.strictObject({
  route: routeNameSchema,
  key: objectKeySchema,
  /** Download file name. A blank value is omitted. */
  name: optionalFileNameSchema,
  disposition: downloadDispositionSchema.optional(),
});
