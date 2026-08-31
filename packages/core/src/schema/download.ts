import { z } from "zod";
import {
  objectKeySchema,
  optionalTrimmedString,
  routeNameSchema,
} from "./shared";

/** Query string — numbers arrive as strings. Extra keys are rejected. */
export const downloadQuerySchema = z.strictObject({
  route: routeNameSchema,
  key: objectKeySchema,
  fileName: optionalTrimmedString,
});
