import type { IncomingMessage, ServerResponse } from "node:http";
import { toNodeHandler, type NodeHandlerOptions } from "./node";
import type { DimahS3HandlerSource } from "./types";

export type { NodeHandlerOptions };

/** Structural Fastify request/reply — avoids a hard dependency on `fastify`. */
type FastifyRequestLike = {
  raw: IncomingMessage;
};

type FastifyReplyLike = {
  raw: ServerResponse;
  hijack: () => void;
};

/**
 * Adapt a dimah-s3 instance to a Fastify route handler.
 *
 * Uses `reply.hijack()` and the Node adapter so Fastify does not touch the
 * response stream. Turn Fastify's body parsing off for these routes, as
 * below, so the adapter can stream the raw body. Takes the same options as
 * `toNodeHandler`.
 *
 * @example
 * ```ts
 * import Fastify from "fastify";
 * import { toFastifyHandler } from "@dimah-s3/server/fastify";
 * import { s3 } from "./s3";
 *
 * const app = Fastify();
 * app.register(async (scope) => {
 *   scope.removeAllContentTypeParsers();
 *   scope.addContentTypeParser("*", (_request, _payload, done) => done(null));
 *   scope.all("/api/s3/*", toFastifyHandler(s3));
 * });
 * ```
 */
export function toFastifyHandler(
  s3: DimahS3HandlerSource,
  options?: NodeHandlerOptions,
) {
  const handler = toNodeHandler(s3, options);
  return async (req: FastifyRequestLike, reply: FastifyReplyLike) => {
    reply.hijack();
    await handler(req.raw, reply.raw);
  };
}
