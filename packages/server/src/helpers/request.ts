/** Origin for server-side calls that did not arrive over HTTP. */
const SYNTHETIC_ORIGIN = "http://dimah-s3.local";

/** Headers-only request for `s3.put` and the middleware fallback. */
export function requestFromHeaders(headers?: HeadersInit): Request {
  return new Request(SYNTHETIC_ORIGIN, { headers });
}

/**
 * Request for a direct `s3.api` call when the caller did not pass one.
 * Copies scalar `query` values and a plain JSON `body` so hooks see the same
 * request an HTTP call would. better-call has no option for this: direct
 * invocation passes `body` / `query` as objects and leaves `request` to us.
 */
export function requestFromDirectCall(input: {
  method: string;
  pathname: string;
  headers?: HeadersInit;
  query?: unknown;
  body?: unknown;
}): Request {
  const url = new URL(input.pathname, SYNTHETIC_ORIGIN);
  appendQuery(url, input.query);
  const headers = new Headers(input.headers);
  const body = jsonBody(input.method, input.body, headers);
  return new Request(url, { method: input.method, headers, body });
}

function appendQuery(url: URL, query: unknown): void {
  if (query == null || typeof query !== "object" || Array.isArray(query))
    return;
  for (const [key, value] of Object.entries(query)) {
    if (
      typeof value !== "string" &&
      typeof value !== "number" &&
      typeof value !== "boolean"
    ) {
      continue;
    }
    url.searchParams.set(key, String(value));
  }
}

/** Plain objects and arrays. Query schemas are scalars; bodies are JSON. */
function jsonBody(
  method: string,
  body: unknown,
  headers: Headers,
): string | undefined {
  if (
    body == null ||
    method === "GET" ||
    method === "HEAD" ||
    !isPlainJson(body)
  ) {
    return;
  }
  // `headers()` from the incoming call can carry a length for a different body.
  headers.delete("content-length");
  headers.delete("transfer-encoding");
  headers.set("content-type", "application/json");
  return JSON.stringify(body);
}

function isPlainJson(
  body: unknown,
): body is Record<string, unknown> | unknown[] {
  if (typeof body !== "object" || body === null) return false;
  const proto = Object.getPrototypeOf(body);
  return proto === Object.prototype || proto === Array.prototype;
}
