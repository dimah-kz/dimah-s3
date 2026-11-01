import { s3Error, S3_API_ROUTES, S3_ERROR_CODES } from "@dimah-s3/core";
import { createEndpoint, type Endpoint } from "better-call";
import { describe, expect, it, vi } from "vitest";
import * as z from "zod";
import { dimahS3 } from "@/dimah-s3";
import { definePlugin } from "@/plugin";
import {
  apiUrl,
  defaultUploadBody,
  expectErrorCode,
  jsonRequest,
  memoryS3,
  testInstanceConfig,
} from "@/test/harness";
import type { DimahS3Config } from "@/types";
import { createS3Endpoint } from "./create-s3-endpoint";
import { coreEndpoints } from "./core-endpoints";

const echo = createS3Endpoint(
  "/echo",
  { method: "POST", body: z.object({ text: z.string() }) },
  async (ctx) => ({ text: ctx.body.text }),
);

function createInstance(
  overrides: Partial<DimahS3Config> = {},
  endpoints: Record<string, Endpoint> = { echo },
) {
  return dimahS3(
    testInstanceConfig({
      plugins: [definePlugin({ id: "test", endpoints })],
      ...overrides,
    }),
  );
}

/** A body stream that counts how many chunks were read from it. */
function countingStream(chunk: string, chunks = Infinity) {
  const bytes = new TextEncoder().encode(chunk);
  const state = { pulled: 0, cancelled: false };
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        state.pulled += 1;
        if (state.pulled > chunks) controller.close();
        else controller.enqueue(bytes);
      },
      cancel() {
        state.cancelled = true;
      },
    },
    { highWaterMark: 0 },
  );
  return { stream, state };
}

function streamRequest(path: string, body: ReadableStream, headers = {}) {
  return new Request(apiUrl(path), {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
    duplex: "half",
  } as RequestInit);
}

const PROTOCOL: readonly [
  keyof typeof coreEndpoints,
  keyof typeof S3_API_ROUTES,
  string,
][] = [
  ["upload", "upload", "POST"],
  ["confirm", "confirm", "POST"],
  ["download", "download", "GET"],
  ["catalog", "catalog", "GET"],
  ["file", "file", "GET"],
  ["delete", "delete", "DELETE"],
  ["deleteMany", "deleteMany", "POST"],
  ["multipartInit", "multipartInit", "POST"],
  ["multipartSignPart", "multipartSignPart", "POST"],
  ["multipartListParts", "multipartListParts", "POST"],
  ["multipartComplete", "multipartComplete", "POST"],
  ["multipartAbort", "multipartAbort", "POST"],
];

describe("core protocol", () => {
  it("mounts one endpoint per protocol route", () => {
    expect(Object.keys(coreEndpoints).toSorted()).toEqual(
      PROTOCOL.map(([name]) => name).toSorted(),
    );
  });

  it.each(PROTOCOL)("%s is %s at its route", (name, route, method) => {
    const endpoint = coreEndpoints[name];
    expect(endpoint.path).toBe(S3_API_ROUTES[route]);
    expect(endpoint.options.method).toBe(method);
  });

  it("reads body endpoints as JSON from a clone", () => {
    for (const endpoint of Object.values(coreEndpoints)) {
      const options = endpoint.options as {
        method: string;
        cloneRequest?: boolean;
        metadata?: { allowedMediaTypes?: string[] };
      };
      if (options.method !== "POST") continue;
      expect(options.cloneRequest).toBe(true);
      expect(options.metadata?.allowedMediaTypes).toEqual(["application/json"]);
    }
  });
});

describe("request body cap", () => {
  it("rejects a declared Content-Length over the cap without reading", async () => {
    const s3 = createInstance({ maxRequestBodySize: 64 });
    const { stream, state } = countingStream("x");

    const res = await s3.handler(
      streamRequest("/echo", stream, { "content-length": "65" }),
    );

    expect(res.status).toBe(413);
    await expect(res.json()).resolves.toEqual({
      code: S3_ERROR_CODES.REQUEST_TOO_LARGE.code,
      message: "Request body exceeds 64 bytes",
      params: { maxSize: 64 },
    });
    expect(state.pulled).toBe(0);
  });

  it("counts a body without Content-Length and stops reading at the cap", async () => {
    const s3 = createInstance({ maxRequestBodySize: 64 });
    const { stream, state } = countingStream("x".repeat(16));

    const res = await s3.handler(streamRequest("/echo", stream));

    await expectErrorCode(res, 413, S3_ERROR_CODES.REQUEST_TOO_LARGE);
    expect(state.pulled).toBe(5);
    expect(state.cancelled).toBe(true);
  });

  it("does not trust a Content-Length below the real size", async () => {
    const s3 = createInstance({ maxRequestBodySize: 64 });
    const { stream } = countingStream("x".repeat(16));

    const res = await s3.handler(
      streamRequest("/echo", stream, { "content-length": "10" }),
    );

    await expectErrorCode(res, 413, S3_ERROR_CODES.REQUEST_TOO_LARGE);
  });

  it("accepts a body of exactly the cap", async () => {
    const body = JSON.stringify({ text: "ok" });
    const s3 = createInstance({ maxRequestBodySize: body.length });
    const { stream } = countingStream(body, 1);

    const res = await s3.handler(streamRequest("/echo", stream));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ text: "ok" });
  });

  it("applies the 1 MiB default cap", async () => {
    const s3 = createInstance();
    const res = await s3.handler(
      jsonRequest(apiUrl("/echo"), { body: { text: "x".repeat(1_048_576) } }),
    );
    await expectErrorCode(res, 413, S3_ERROR_CODES.REQUEST_TOO_LARGE);
  });

  it("keeps the body readable for guards and the request signal", async () => {
    const storage = memoryS3();
    const seen: unknown[] = [];
    const signals: AbortSignal[] = [];
    const s3 = createInstance({
      client: storage.client,
      guard: async ({ request }) => {
        seen.push(await request.clone().json());
        signals.push(request.signal);
      },
    });
    const controller = new AbortController();
    const request = new Request(apiUrl(S3_API_ROUTES.upload), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(defaultUploadBody),
      signal: controller.signal,
    });

    const res = await s3.handler(request);

    expect(res.status).toBe(200);
    expect(seen).toEqual([defaultUploadBody]);
    controller.abort();
    expect(signals[0]?.aborted).toBe(true);
  });
});

describe("media types", () => {
  it("returns 415 for a form post to a core endpoint", async () => {
    const s3 = createInstance();
    const res = await s3.handler(
      new Request(apiUrl(S3_API_ROUTES.upload), {
        method: "POST",
        body: new URLSearchParams({ route: "uploads", name: "a.png" }),
      }),
    );
    await expectErrorCode(res, 415, S3_ERROR_CODES.UNSUPPORTED_MEDIA_TYPE);
  });

  it("returns 415 for a non-JSON body to a plain better-call endpoint", async () => {
    const handler = vi.fn(async () => ({ ok: true }));
    const raw = createEndpoint("/raw", { method: "POST" }, handler);
    const s3 = createInstance({}, { raw });

    const res = await s3.handler(
      new Request(apiUrl("/raw"), {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: "hello",
      }),
    );

    await expectErrorCode(res, 415, S3_ERROR_CODES.UNSUPPORTED_MEDIA_TYPE);
    expect(handler).not.toHaveBeenCalled();
  });

  it("returns VALIDATION_ERROR for malformed JSON", async () => {
    const s3 = createInstance();
    const res = await s3.handler(
      new Request(apiUrl("/echo"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      }),
    );
    await expectErrorCode(res, 400, S3_ERROR_CODES.VALIDATION_ERROR);
  });
});

describe("error boundary", () => {
  it("returns JSON NOT_FOUND for a path or method no endpoint serves", async () => {
    const s3 = createInstance();

    const unknown = await s3.handler(new Request(apiUrl("/nope")));
    await expectErrorCode(unknown, 404, S3_ERROR_CODES.NOT_FOUND);
    expect(unknown.headers.get("content-type")).toBe("application/json");

    const wrongMethod = await s3.handler(
      new Request(apiUrl(S3_API_ROUTES.upload)),
    );
    await expectErrorCode(wrongMethod, 404, S3_ERROR_CODES.NOT_FOUND);

    const outside = await s3.handler(
      new Request(`http://localhost/other${S3_API_ROUTES.catalog}`),
    );
    await expectErrorCode(outside, 404, S3_ERROR_CODES.NOT_FOUND);
  });

  it("logs a plain Error from a plain better-call endpoint and returns 500", async () => {
    const failure = new Error("boom");
    const raw = createEndpoint("/raw", { method: "GET" }, async () => {
      throw failure;
    });
    const error = vi.fn();
    const onError = vi.fn();
    const s3 = createInstance({ logger: { error }, onError }, { raw });
    const request = new Request(apiUrl("/raw"));

    const res = await s3.handler(request);

    await expectErrorCode(res, 500, S3_ERROR_CODES.INTERNAL_ERROR);
    expect(error).toHaveBeenCalledWith("boom", failure);
    expect(onError).toHaveBeenCalledWith(
      failure,
      expect.objectContaining({ request: expect.any(Request) }),
    );
  });

  it("does not log a body read that fails after the client left", async () => {
    const error = vi.fn();
    const s3 = createInstance({ logger: { error } });
    const controller = new AbortController();
    const body = new ReadableStream<Uint8Array>({
      pull() {
        controller.abort();
        throw new Error("socket closed");
      },
    });
    const request = new Request(apiUrl("/echo"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      duplex: "half",
      signal: controller.signal,
    } as RequestInit);

    const res = await s3.handler(request);

    await expectErrorCode(res, 500, S3_ERROR_CODES.INTERNAL_ERROR);
    expect(error).not.toHaveBeenCalled();
  });
});

describe("/file over HTTP", () => {
  const CSP =
    "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox";

  function fileInstance(guard?: () => void) {
    const s3 = memoryS3();
    s3.seed("uploads/a.png", "0123456789", { contentType: "image/png" });
    return dimahS3(
      testInstanceConfig({
        client: s3.client,
        routes: {
          uploads: { keyPrefix: "uploads", download: { mode: "proxy", guard } },
        },
      }),
    );
  }

  function fileRequest(query: string, headers: HeadersInit = {}) {
    return new Request(apiUrl(`${S3_API_ROUTES.file}?${query}`), { headers });
  }

  function expectFileHeaders(headers: Headers) {
    expect(headers.get("content-security-policy")).toBe(CSP);
    expect(headers.get("x-content-type-options")).toBe("nosniff");
    expect(headers.get("cross-origin-resource-policy")).toBe("same-origin");
    expect(headers.get("cache-control")).toBe("private, no-cache");
    expect(headers.get("accept-ranges")).toBe("bytes");
  }

  const KEY = "route=uploads&key=uploads%2Fa.png";

  it("sends the file headers on a 200", async () => {
    const res = await fileInstance().handler(fileRequest(KEY));

    expect(res.status).toBe(200);
    expectFileHeaders(res.headers);
    await expect(res.text()).resolves.toBe("0123456789");
  });

  it.each([
    ["a guard rejection", 403, S3_ERROR_CODES.FORBIDDEN, KEY, {}],
    [
      "a missing object",
      404,
      S3_ERROR_CODES.OBJECT_NOT_FOUND,
      "route=uploads&key=uploads%2Fmissing.png",
      {},
    ],
    [
      "a failed precondition",
      412,
      S3_ERROR_CODES.PRECONDITION_FAILED,
      KEY,
      { "if-match": '"other"' },
    ],
    [
      "an unsatisfiable range",
      416,
      S3_ERROR_CODES.RANGE_NOT_SATISFIABLE,
      KEY,
      { range: "bytes=100-200" },
    ],
    [
      "a malformed query",
      400,
      S3_ERROR_CODES.VALIDATION_ERROR,
      "route=uploads",
      {},
    ],
  ])(
    "sends the file headers on %s",
    async (_, status, code, query, headers) => {
      const s3 = fileInstance(() => {
        if (status === 403) throw s3Error("FORBIDDEN");
      });

      const res = await s3.handler(fileRequest(query, headers));

      expectFileHeaders(res.headers);
      await expectErrorCode(res, status, code);
    },
  );

  it("names the object size in Content-Range on a 416", async () => {
    const res = await fileInstance().handler(
      fileRequest(KEY, { range: "bytes=100-200" }),
    );

    expect(res.status).toBe(416);
    expect(res.headers.get("content-range")).toBe("bytes */10");
  });
});
