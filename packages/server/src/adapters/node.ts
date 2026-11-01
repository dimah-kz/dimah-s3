import type {
  IncomingHttpHeaders,
  IncomingMessage,
  ServerResponse,
} from "node:http";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { s3Error } from "@dimah-s3/core";
import { toResponse } from "better-call";
import { defaultLogger } from "@/helpers/logger";
import type { DimahS3HandlerSource } from "./types";

/** Options of the Node, Express and Fastify adapters. */
export type NodeHandlerOptions = {
  /**
   * Build the request URL from `X-Forwarded-Proto` and `X-Forwarded-Host`.
   * Turn it on only behind a proxy that sets them, since clients can send
   * them too. Default `false`.
   */
  trustProxy?: boolean;
};

/**
 * Convert Node.js / Express request headers into a Web {@link Headers} object.
 * Useful when calling `s3.api.*` from a Node handler. HTTP/2 pseudo-headers
 * (`:path`) are left out.
 *
 * @example
 * ```ts
 * import { fromNodeHeaders } from "@dimah-s3/server/node";
 *
 * await s3.api.download({ route, key }, { headers: fromNodeHeaders(req.headers) });
 * ```
 */
export function fromNodeHeaders(nodeHeaders: IncomingHttpHeaders): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(nodeHeaders)) {
    if (value == null || key.startsWith(":")) continue;
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else {
      headers.set(key, value);
    }
  }
  return headers;
}

/**
 * Adapt a dimah-s3 instance to Node.js `http` / Express-style handlers.
 *
 * The request body streams from `req`, so the body cap is counted as bytes
 * arrive. When the client disconnects before the response finishes, the
 * request signal aborts and so does the S3 call behind it. Response bodies,
 * such as a `/file` download, stream to `res`.
 *
 * @example
 * ```ts
 * import { createServer } from "node:http";
 * import { toNodeHandler } from "@dimah-s3/server/node";
 * import { s3 } from "./s3";
 *
 * createServer(toNodeHandler(s3)).listen(3000);
 * // Behind a proxy that sets X-Forwarded-Proto / X-Forwarded-Host:
 * // createServer(toNodeHandler(s3, { trustProxy: true }));
 * ```
 */
export function toNodeHandler(
  s3: DimahS3HandlerSource,
  options: NodeHandlerOptions = {},
) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const controller = new AbortController();
    res.once("close", () => {
      if (!res.writableFinished) controller.abort();
    });

    try {
      const request = toWebRequest(req, controller.signal, options);
      await writeWebResponse(res, await s3.handler(request));
    } catch (error) {
      // The client went away; there is no one to answer.
      if (controller.signal.aborted) return;
      defaultLogger.error?.("Node adapter failed", error);
      if (res.headersSent) {
        res.destroy();
      } else {
        await writeWebResponse(res, toResponse(s3Error("INTERNAL_ERROR")));
      }
    }
  };
}

function toWebRequest(
  req: IncomingMessage,
  signal: AbortSignal,
  options: NodeHandlerOptions,
): Request {
  const method = (req.method ?? "GET").toUpperCase();
  const hasBody = method !== "GET" && method !== "HEAD";
  const init: RequestInit & { duplex?: "half" } = {
    method,
    headers: fromNodeHeaders(req.headers),
    signal,
  };
  if (hasBody) {
    // The DOM and Node typings of ReadableStream differ; the runtime object is the same.
    init.body = Readable.toWeb(req) as ReadableStream<Uint8Array<ArrayBuffer>>;
    // Node's fetch needs `duplex` for a streaming body.
    init.duplex = "half";
  }
  return new Request(requestURL(req, options), init);
}

/**
 * The absolute request URL, from the socket or the trusted proxy headers.
 * Express sets `originalUrl`, which keeps the mount path that
 * `app.use("/api/s3", …)` strips from `url`.
 */
function requestURL(req: IncomingMessage, options: NodeHandlerOptions): URL {
  const encrypted = (req.socket as { encrypted?: boolean }).encrypted === true;
  let protocol = encrypted ? "https" : "http";
  let host = req.headers.host ?? "localhost";

  if (options.trustProxy) {
    const forwardedProto = firstHeaderValue(req.headers["x-forwarded-proto"]);
    if (forwardedProto === "http" || forwardedProto === "https") {
      protocol = forwardedProto;
    }
    host = firstHeaderValue(req.headers["x-forwarded-host"]) || host;
  }
  const path = (req as { originalUrl?: string }).originalUrl ?? req.url;
  return new URL(path ?? "/", `${protocol}://${host}`);
}

/** The first entry of a header that proxies may append to (`a, b`). */
function firstHeaderValue(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.split(",")[0]?.trim().toLowerCase() ?? "";
}

async function writeWebResponse(
  res: ServerResponse,
  response: Response,
): Promise<void> {
  res.statusCode = response.status;
  for (const [key, value] of response.headers) {
    if (key === "set-cookie") continue;
    res.setHeader(key, value);
  }
  const cookies = response.headers.getSetCookie();
  if (cookies.length > 0) res.setHeader("set-cookie", cookies);

  if (response.body === null) {
    res.end();
    return;
  }
  await pipeline(
    Readable.fromWeb(response.body as NodeReadableStream<Uint8Array>),
    res,
  );
}
