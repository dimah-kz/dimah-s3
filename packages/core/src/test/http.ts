import { vi } from "vitest";

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.href;
  }
  return input.url;
}

/** JSON `Response` for stubbing `createS3Client({ fetch })`. */
export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Record every `fetch` call and return 200 `{ ok: true }` by default. */
export function captureFetch(
  respond: (input: RequestInfo | URL, init?: RequestInit) => Response = () =>
    jsonResponse({ ok: true }),
) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: requestUrl(input), init: init ?? {} });
    return respond(input, init);
  });
  return { fetch, calls };
}
