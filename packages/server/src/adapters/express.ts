import { fromNodeHeaders, toNodeHandler } from "./node";
import type { DimahS3HandlerSource } from "./types";

export { fromNodeHeaders };

/**
 * Adapt a dimah-s3 instance to an Express / Connect handler.
 *
 * Mount **before** `express.json()` so the request body is not consumed early.
 *
 * @example
 * ```ts
 * import express from "express";
 * import { toExpressHandler } from "@dimah-s3/server/express";
 * import { s3 } from "./s3";
 *
 * const app = express();
 * // Express 4
 * app.all("/api/s3/*", toExpressHandler(s3));
 * // Express 5 — named wildcard
 * // app.all("/api/s3/*splat", toExpressHandler(s3));
 * app.use(express.json());
 * ```
 */
export function toExpressHandler(s3: DimahS3HandlerSource) {
  return toNodeHandler(s3);
}
