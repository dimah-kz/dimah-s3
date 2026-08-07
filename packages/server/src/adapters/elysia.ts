import type { DimahS3HandlerSource } from "./types";

/** Structural Elysia context — avoids a hard dependency on `elysia`. */
type ElysiaContext = {
  request: Request;
};

/**
 * Adapt a dimah-s3 instance to an Elysia route handler.
 *
 * @example
 * ```ts
 * import { Elysia } from "elysia";
 * import { toElysiaHandler } from "@dimah-s3/server/elysia";
 * import { s3 } from "./s3";
 *
 * new Elysia()
 *   .all("/api/s3/*", toElysiaHandler(s3))
 *   .listen(3000);
 * ```
 */
export function toElysiaHandler(s3: DimahS3HandlerSource) {
  return (ctx: ElysiaContext) => s3.handler(ctx.request);
}
