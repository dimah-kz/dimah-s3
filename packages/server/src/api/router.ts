import { s3Error } from "@dimah-s3/core";
import { createRouter, toResponse, type Endpoint } from "better-call";
import { toAPIError } from "@/helpers/error-boundary";
import type { DimahS3Config } from "@/types/config";
import type { ResolvedConfig } from "@/types/resolved";
import { BODY_MEDIA_TYPES } from "./create-s3-endpoint";
import { createRouterContext } from "./router-context";

/**
 * The HTTP router of a dimah-s3 instance. Internal: `dimahS3()` returns its
 * `handler`.
 *
 * - The body is capped at `maxRequestBodySize` before anything parses it.
 *   A declared `Content-Length` over the cap fails at once, and a body
 *   without one is counted as it streams. Either way the client gets
 *   `413 REQUEST_TOO_LARGE`.
 * - A body that is not `application/json` returns `415
 *   UNSUPPORTED_MEDIA_TYPE`, for plugin endpoints too.
 * - Every failure is a JSON `APIError` (see {@link toAPIError}), and a path
 *   no endpoint serves returns `404 NOT_FOUND`.
 */
export function createS3Router<E extends Record<string, Endpoint>>(
  endpoints: E,
  env: { config: Readonly<DimahS3Config>; resolved: ResolvedConfig },
): { handler: (request: Request) => Promise<Response> } {
  const { resolved } = env;
  const router = createRouter(endpoints, {
    basePath: resolved.basePath,
    routerContext: createRouterContext(env.config, resolved),
    openapi: { disabled: true },
    allowedMediaTypes: BODY_MEDIA_TYPES,
    onError: (error, request) => {
      throw toAPIError(error, resolved, request);
    },
  });

  return {
    handler: async (request) => {
      try {
        const capped = await capRequestBody(
          request,
          resolved.maxRequestBodySize,
        );
        const response = await router.handler(capped);
        return isUnmatched(response)
          ? toResponse(s3Error("NOT_FOUND"))
          : response;
      } catch (error) {
        return toResponse(toAPIError(error, resolved, request));
      }
    },
  };
}

/**
 * Reads the request body, counting bytes, and returns a request that
 * carries the bytes read. The request keeps its signal, so a client
 * disconnect still reaches S3 calls. A request without a body is returned
 * as it is.
 */
async function capRequestBody(
  request: Request,
  maxSize: number,
): Promise<Request> {
  if (request.body === null) return request;

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > maxSize) throw s3Error("REQUEST_TOO_LARGE", { maxSize });

  const reader = request.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxSize) {
      // Stop reading; the client may keep sending, but nothing is buffered.
      reader.cancel().catch(() => undefined);
      throw s3Error("REQUEST_TOO_LARGE", { maxSize });
    }
    chunks.push(value);
  }
  // Copy the parts, not the request: `new Request(request)` reads private
  // fields that a Proxy (as Next.js route handlers pass) does not carry.
  return new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: new Blob(chunks),
    signal: request.signal,
  });
}

/** better-call answers a path no endpoint serves with an empty 404. */
function isUnmatched(response: Response): boolean {
  return response.status === 404 && response.body === null;
}
