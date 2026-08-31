import type { DimahS3HandlerSource } from "./types";

/** Structural Hono context — avoids a hard dependency on `hono`. */
type HonoContext = {
  req: { raw: Request };
};

/**
 * Adapt a dimah-s3 instance to a Hono route handler.
 *
 * @example
 * ```ts
 * import { Hono } from "hono";
 * import { toHonoHandler } from "@dimah-s3/server/hono";
 * import { s3 } from "./s3";
 *
 * const app = new Hono();
 * app.on(["GET", "POST", "PUT", "PATCH", "DELETE"], "/api/s3/*", toHonoHandler(s3));
 * ```
 */
export function toHonoHandler(s3: DimahS3HandlerSource) {
  return (c: HonoContext) => s3.handler(c.req.raw);
}
