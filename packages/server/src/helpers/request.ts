/** Origin for server-side calls that did not arrive over HTTP. */
const SYNTHETIC_ORIGIN = "http://dimah-s3.local";

const BODYLESS_METHODS = new Set(["GET", "HEAD"]);

/**
 * Headers-only request for `s3.put` and the middleware fallback.
 * Direct `s3.api` calls use {@link requestFromDirectCall} so hooks see query and body.
 */
export function requestFromHeaders(headers?: HeadersInit): Request {
  return new Request(SYNTHETIC_ORIGIN, { headers });
}

/**
 * Request passed to guards and `resolveScope` for a direct `s3.api` call.
 * Mirrors the HTTP request those hooks already see: method, pathname, query, and JSON body.
 * A caller-supplied `request` is not rewritten — this runs only when one was omitted.
 */
export function requestFromDirectCall(input: {
  method: string;
  pathname: string;
  headers?: HeadersInit;
  query?: unknown;
  body?: unknown;
}): Request {
  const url = new URL(input.pathname, SYNTHETIC_ORIGIN);
  appendSearchParams(url, input.query);
  const headers = new Headers(input.headers);
  const body = directCallBody(input.method, input.body, headers);
  return new Request(url, {
    method: input.method,
    headers,
    body,
  });
}

function appendSearchParams(url: URL, query: unknown): void {
  if (query == null || typeof query !== "object") return;
  for (const [key, value] of Object.entries(query)) {
    appendSearchValue(url, key, value);
  }
}

function appendSearchValue(url: URL, key: string, value: unknown): void {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    url.searchParams.append(key, String(value));
    return;
  }
  if (!Array.isArray(value)) return;
  for (const item of value) appendSearchValue(url, key, item);
}

function directCallBody(
  method: string,
  body: unknown,
  headers: Headers,
): BodyInit | undefined {
  if (body == null || BODYLESS_METHODS.has(method)) return undefined;
  if (typeof body === "string" || isBinaryBody(body)) {
    dropStaleBodyHeaders(headers);
    return body;
  }
  if (!isJsonBody(body)) return undefined;
  dropStaleBodyHeaders(headers);
  if (!isJsonContentType(headers.get("content-type"))) {
    headers.set("content-type", "application/json");
  }
  return JSON.stringify(body);
}

function dropStaleBodyHeaders(headers: Headers): void {
  headers.delete("content-length");
  headers.delete("transfer-encoding");
}

function isJsonContentType(value: string | null): boolean {
  return (
    value != null && /^application\/(?:[a-z0-9.+-]+\+)?json\b/i.test(value)
  );
}

function isBinaryBody(body: unknown): body is BodyInit {
  return (
    body instanceof Blob ||
    body instanceof FormData ||
    body instanceof URLSearchParams ||
    body instanceof ArrayBuffer ||
    ArrayBuffer.isView(body)
  );
}

function isJsonBody(
  body: unknown,
): body is Record<string, unknown> | unknown[] {
  if (Array.isArray(body)) return true;
  if (typeof body !== "object" || body === null) return false;
  const proto = Object.getPrototypeOf(body);
  return proto === Object.prototype || proto === null;
}
