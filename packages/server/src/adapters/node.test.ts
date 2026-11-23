import { GetObjectCommand } from "@aws-sdk/client-s3";
import { S3_API_ROUTES, S3_ERROR_CODES } from "@dimah-s3/core";
import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dimahS3 } from "@/dimah-s3";
import {
  allFeaturesRoute,
  memoryS3,
  mockS3,
  storedPngKey,
  testInstanceConfig,
  TEST_BUCKET,
} from "@/test/harness";
import { toExpressHandler } from "./express";
import { toFastifyHandler } from "./fastify";
import { toNodeHandler } from "./node";

const servers: { close: () => Promise<void> }[] = [];

/** `/file` serves only routes whose downloads are in proxy mode. */
const proxyRoutes = {
  uploads: allFeaturesRoute({ download: { mode: "proxy" } }),
};

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
  vi.restoreAllMocks();
});

/** A Node handler, as the adapters return it. */
type NodeListener = (
  req: IncomingMessage,
  res: ServerResponse,
) => Promise<void>;

/** Listens on a free local port and returns the origin. */
async function listen(listener: NodeListener): Promise<string> {
  const server = createServer((req, res) => {
    void listener(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push({
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  });
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

/** A handler source that records the request and answers with `respond`. */
function recorder(respond: (request: Request) => Response | Promise<Response>) {
  const requests: Request[] = [];
  const handler = vi.fn(async (request: Request) => {
    requests.push(request);
    return respond(request);
  });
  return { handler, requests };
}

/** Opens a raw HTTP request, so a test controls when the body ends. */
function openRequest(
  url: string,
  init: { method?: string; headers?: Record<string, string> } = {},
) {
  const req = httpRequest(url, init);
  const response = new Promise<IncomingMessage>((resolve, reject) => {
    req.on("response", resolve);
    req.on("error", reject);
  });
  return { req, response };
}

function readText(res: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let text = "";
    res.setEncoding("utf8");
    res.on("data", (chunk: string) => {
      text += chunk;
    });
    res.on("end", () => resolve(text));
    res.on("error", reject);
  });
}

describe("toNodeHandler request", () => {
  it("streams the body to the handler as it arrives", async () => {
    const { handler, requests } = recorder(
      async (request) => new Response(await request.text()),
    );
    const origin = await listen(toNodeHandler({ handler }));
    const { req, response } = openRequest(`${origin}/api/s3/echo`, {
      method: "POST",
      headers: { "content-type": "application/json" },
    });

    req.write('{"text":');
    await vi.waitFor(() => expect(handler).toHaveBeenCalledOnce());
    req.end('"ok"}');
    const res = await response;

    await expect(readText(res)).resolves.toBe('{"text":"ok"}');
    const [request] = requests;
    expect(request?.method).toBe("POST");
    expect(request?.headers.get("content-type")).toBe("application/json");
    expect(new URL(request?.url ?? "").pathname).toBe("/api/s3/echo");
  });

  it("sends no body for GET", async () => {
    const { handler, requests } = recorder(() => new Response("ok"));
    const origin = await listen(toNodeHandler({ handler }));

    await fetch(`${origin}/api/s3${S3_API_ROUTES.catalog}`);

    expect(requests[0]?.method).toBe("GET");
    expect(requests[0]?.body).toBeNull();
  });

  it("ignores X-Forwarded-* unless trustProxy is on", async () => {
    const { handler, requests } = recorder(() => new Response("ok"));
    const headers = {
      "x-forwarded-proto": "https, http",
      "x-forwarded-host": "files.example.com, proxy.internal",
    };
    const plain = await listen(toNodeHandler({ handler }));
    const trusted = await listen(
      toNodeHandler({ handler }, { trustProxy: true }),
    );

    await fetch(`${plain}/api/s3/routes`, { headers });
    await fetch(`${trusted}/api/s3/routes?x=1`, { headers });

    expect(requests[0]?.url).toBe(`${plain}/api/s3/routes`);
    expect(requests[1]?.url).toBe(
      "https://files.example.com/api/s3/routes?x=1",
    );
  });

  it("keeps the socket protocol for an X-Forwarded-Proto it does not know", async () => {
    const { handler, requests } = recorder(() => new Response("ok"));
    const origin = await listen(
      toNodeHandler({ handler }, { trustProxy: true }),
    );

    await fetch(`${origin}/api/s3/routes`, {
      headers: { "x-forwarded-proto": "javascript" },
    });

    expect(requests[0]?.url).toBe(`${origin}/api/s3/routes`);
  });
});

describe("toNodeHandler response", () => {
  it("streams the body to the client", async () => {
    const encoder = new TextEncoder();
    let push!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        push = controller;
        controller.enqueue(encoder.encode("first "));
      },
    });
    const origin = await listen(
      toNodeHandler({ handler: async () => new Response(body) }),
    );
    const { req, response } = openRequest(`${origin}/api/s3/file`);
    req.end();
    const res = await response;
    res.setEncoding("utf8");

    const first = await new Promise<string>((resolve) =>
      res.once("data", resolve),
    );
    const rest = readText(res);
    push.enqueue(encoder.encode("second"));
    push.close();

    expect(first).toBe("first ");
    await expect(rest).resolves.toBe("second");
  });

  it("writes the status, headers and every Set-Cookie", async () => {
    const headers = new Headers({ "content-type": "application/json" });
    headers.append("set-cookie", "a=1");
    headers.append("set-cookie", "b=2");
    const origin = await listen(
      toNodeHandler({
        handler: async () =>
          new Response('{"ok":true}', { status: 201, headers }),
      }),
    );
    const { req, response } = openRequest(`${origin}/api/s3/x`);
    req.end();
    const res = await response;

    expect(res.statusCode).toBe(201);
    expect(res.headers["content-type"]).toBe("application/json");
    expect(res.headers["set-cookie"]).toEqual(["a=1", "b=2"]);
    await expect(readText(res)).resolves.toBe('{"ok":true}');
  });

  it("returns a logged INTERNAL_ERROR when the handler throws", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failure = new Error("boom");
    const origin = await listen(
      toNodeHandler({
        handler: async () => {
          throw failure;
        },
      }),
    );

    const res = await fetch(`${origin}/api/s3/routes`);

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({
      code: S3_ERROR_CODES.INTERNAL_ERROR.code,
    });
    expect(log).toHaveBeenCalledWith(
      "[dimah-s3]",
      "Node adapter failed",
      failure,
    );
  });

  it("does not abort the signal once the response finished", async () => {
    const { handler, requests } = recorder(() => new Response("ok"));
    const origin = await listen(toNodeHandler({ handler }));

    const res = await fetch(`${origin}/api/s3/routes`);
    await res.text();

    expect(requests[0]?.signal.aborted).toBe(false);
  });
});

describe("toNodeHandler with dimahS3", () => {
  it("aborts the GetObject when the client disconnects", async () => {
    const sent = Promise.withResolvers<AbortSignal>();
    const aborted = Promise.withResolvers<void>();
    const send = vi.fn(
      (command: unknown, options?: { abortSignal?: AbortSignal }) => {
        const signal = options?.abortSignal;
        if (!(command instanceof GetObjectCommand) || !signal) {
          return Promise.resolve({});
        }
        sent.resolve(signal);
        return new Promise((_, reject) => {
          signal.addEventListener("abort", () => {
            aborted.resolve();
            reject(new Error("GetObject aborted"));
          });
        });
      },
    );
    const s3 = dimahS3(
      testInstanceConfig({
        client: mockS3(send as never),
        routes: proxyRoutes,
      }),
    );
    const origin = await listen(toNodeHandler(s3));
    const req = httpRequest(
      `${origin}/api/s3/file?route=uploads&key=${storedPngKey}`,
    );
    // Destroying the request below makes it emit "socket hang up".
    req.on("error", () => undefined);
    req.end();

    const signal = await sent.promise;
    expect(signal.aborted).toBe(false);
    req.destroy();

    await aborted.promise;
    expect(signal.aborted).toBe(true);
  });

  it("streams a /file download", async () => {
    const storage = memoryS3();
    const bytes = new Uint8Array(256 * 1024).fill(7);
    storage.seed(storedPngKey, bytes, { contentType: "image/png" });
    const s3 = dimahS3(
      testInstanceConfig({ client: storage.client, routes: proxyRoutes }),
    );
    const origin = await listen(toNodeHandler(s3));

    const res = await fetch(
      `${origin}/api/s3/file?route=uploads&key=${storedPngKey}`,
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-length")).toBe(String(bytes.byteLength));
    const received = new Uint8Array(await res.arrayBuffer());
    // `toEqual` diffs every byte and can spend the whole test timeout on CI.
    expect(received).toHaveLength(bytes.length);
    let mismatch = -1;
    for (let index = 0; index < bytes.length; index++) {
      if (received[index] !== bytes[index]) {
        mismatch = index;
        break;
      }
    }
    expect(mismatch).toBe(-1);
    expect(storage.objects.has(`${TEST_BUCKET}/${storedPngKey}`)).toBe(true);
  });

  it("returns 413 for a chunked body over the cap", async () => {
    const s3 = dimahS3(testInstanceConfig({ maxRequestBodySize: 64 }));
    const origin = await listen(toNodeHandler(s3));
    const { req, response } = openRequest(
      `${origin}/api/s3${S3_API_ROUTES.upload}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
      },
    );
    req.on("error", () => undefined);
    req.write("x".repeat(40));
    req.end("x".repeat(40));
    const res = await response;

    expect(res.statusCode).toBe(413);
    await expect(readText(res).then(JSON.parse)).resolves.toMatchObject({
      code: S3_ERROR_CODES.REQUEST_TOO_LARGE.code,
    });
  });
});

describe("framework adapters", () => {
  it("toExpressHandler keeps the mount path from req.originalUrl", async () => {
    const { handler, requests } = recorder(() => new Response("ok"));
    const express = toExpressHandler({ handler });
    // What `app.use("/api/s3", …)` does to the request before the handler.
    const origin = await listen((req, res) => {
      const mounted = Object.assign(req, {
        originalUrl: req.url,
        url: req.url?.replace(/^\/api\/s3/, "") || "/",
      });
      return express(mounted, res);
    });

    await fetch(`${origin}/api/s3/routes?x=1`);

    expect(requests[0]?.url).toBe(`${origin}/api/s3/routes?x=1`);
  });

  it("toExpressHandler forwards the options", async () => {
    const { handler, requests } = recorder(() => new Response("ok"));
    const origin = await listen(
      toExpressHandler({ handler }, { trustProxy: true }),
    );

    await fetch(`${origin}/api/s3/routes`, {
      headers: { "x-forwarded-host": "files.example.com" },
    });

    expect(requests[0]?.url).toBe("http://files.example.com/api/s3/routes");
  });

  it("toFastifyHandler hijacks the reply and forwards the options", async () => {
    const { handler, requests } = recorder(() => new Response("ok"));
    const hijack = vi.fn();
    const fastify = toFastifyHandler({ handler }, { trustProxy: true });
    const origin = await listen((req, res) =>
      fastify({ raw: req }, { raw: res, hijack }),
    );

    const res = await fetch(`${origin}/api/s3/routes`, {
      headers: { "x-forwarded-proto": "https" },
    });

    await expect(res.text()).resolves.toBe("ok");
    expect(hijack).toHaveBeenCalledOnce();
    expect(new URL(requests[0]?.url ?? "").protocol).toBe("https:");
  });
});
