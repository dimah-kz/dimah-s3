import type { DimahS3HandlerSource } from "./types";

/**
 * Adapt a dimah-s3 instance to Next.js App Router route handlers.
 *
 * @example
 * ```ts
 * import { toNextJsHandler } from "@dimah-s3/server/next";
 * import { s3 } from "@/lib/s3";
 *
 * export const { GET, POST, DELETE } = toNextJsHandler(s3);
 * ```
 */
export function toNextJsHandler(s3: DimahS3HandlerSource) {
  return {
    GET: s3.handler,
    POST: s3.handler,
    DELETE: s3.handler,
  };
}
