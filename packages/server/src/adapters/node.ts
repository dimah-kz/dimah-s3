import { toResponse } from "better-call";
import type {
  IncomingHttpHeaders,
  IncomingMessage,
  ServerResponse,
} from "node:http";
import { errors } from "../errors";
import type { DimahS3HandlerSource } from "./types";

/**
 * Convert Node.js / Express request headers into a Web {@link Headers} object.
 * Useful when calling `s3.api.*` from a Node handler.
 *
 * @example
 * ```ts
 * import { fromNodeHeaders } from "@dimah-s3/server/node";
 *
 * await s3.api.download({ query: { key }, headers: fromNodeHeaders(req.headers) });
 * ```
 */
export function fromNodeHeaders(nodeHeaders: IncomingHttpHeaders): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(nodeHeaders)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else {
      headers.set(key, value);
    }
  }
  return headers;
}

function collectBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer | string) => {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function toWebRequest(req: IncomingMessage, body: Buffer): Request {
  const host = req.headers.host ?? "localhost";
  const protocol =
    (req.socket as { encrypted?: boolean }).encrypted === true
      ? "https"
      : "http";
  const url = new URL(req.url ?? "/", `${protocol}://${host}`);

  const headers = fromNodeHeaders(req.headers);
  const method = (req.method ?? "GET").toUpperCase();
  const init: RequestInit = { method, headers };
  if (method !== "GET" && method !== "HEAD") {
    init.body = new Uint8Array(body);
    // @ts-expect-error Node fetch duplex for streaming bodies
    init.duplex = "half";
  }

  return new Request(url, init);
}

async function writeWebResponse(
  res: ServerResponse,
  response: Response,
): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  res.end(buffer);
}

/**
 * Adapt a dimah-s3 instance to Node.js `http` / Express-style handlers.
 *
 * @example
 * ```ts
 * import { createServer } from "node:http";
 * import { toNodeHandler } from "@dimah-s3/server/node";
 * import { s3 } from "./s3";
 *
 * createServer(toNodeHandler(s3)).listen(3000);
 * ```
 */
export function toNodeHandler(s3: DimahS3HandlerSource) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    try {
      const body = await collectBody(req);
      const request = toWebRequest(req, body);
      const response = await s3.handler(request);
      await writeWebResponse(res, response);
    } catch (err) {
      console.error("[S3 API]", err);
      if (!res.headersSent) {
        await writeWebResponse(res, toResponse(errors.internalError()));
      }
    }
  };
}
