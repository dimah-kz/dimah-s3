import {
  fromNodeHeaders,
  toNodeHandler,
  type NodeHandlerOptions,
} from "./node";
import type { DimahS3HandlerSource } from "./types";

export { fromNodeHeaders, type NodeHandlerOptions };

/**
 * Adapt a dimah-s3 instance to an Express / Connect handler.
 *
 * Mount **before** `express.json()` so the request body is not consumed early.
 * A route (`app.all`) and a mount (`app.use("/api/s3", …)`) both work: the
 * request URL is read from `req.originalUrl`. Takes the same options as
 * `toNodeHandler`, such as `{ trustProxy: true }` behind a proxy.
 *
 * @example
 * ```ts
 * import express from "express";
 * import { toExpressHandler } from "@dimah-s3/server/express";
 * import { s3 } from "./s3";
 *
 * const app = express();
 * app.use("/api/s3", toExpressHandler(s3));
 * app.use(express.json());
 * ```
 */
export function toExpressHandler(
  s3: DimahS3HandlerSource,
  options?: NodeHandlerOptions,
) {
  return toNodeHandler(s3, options);
}
