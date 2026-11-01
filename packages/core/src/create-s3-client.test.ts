import { describe, expect, it } from "vitest";
import { createS3Client } from "./create-s3-client";
import { APIError, S3_ERROR_CODES } from "./error";
import { defineClientPlugin } from "./plugin/define-client-plugin";
import { pluginPath } from "./plugin/plugin-path";
import { S3_API_BASE_PATH, S3_API_ROUTES } from "./routes";
import { captureFetch, jsonResponse } from "./test/http";

type Client = ReturnType<typeof createS3Client>;

const uploadBody = { route: "uploads", name: "a.png", size: 10 };
const ticket = "v1.payload.signature";

function jsonBody(init: RequestInit | undefined): unknown {
  const body = init?.body;
  if (typeof body !== "string") {
    throw new TypeError("expected JSON string body");
  }
  return JSON.parse(body);
}

function htmlResponse(status: number, statusText: string) {
  return new Response("<html>oops</html>", {
    status,
    statusText,
    headers: { "content-type": "text/html" },
  });
}

describe("createS3Client protocol", () => {
  it.each([
    {
      name: "upload",
      method: "POST",
      path: S3_API_ROUTES.upload,
      run: (api: Client) => api.upload(uploadBody),
    },
    {
      name: "confirm",
      method: "POST",
      path: S3_API_ROUTES.confirm,
      run: (api: Client) => api.confirm({ ticket }),
    },
    {
      name: "download",
      method: "GET",
      path: S3_API_ROUTES.download,
      run: (api: Client) => api.download({ route: "uploads", key: "a.png" }),
    },
    {
      name: "catalog",
      method: "GET",
      path: S3_API_ROUTES.catalog,
      run: (api: Client) => api.catalog(),
    },
    {
      name: "delete",
      method: "DELETE",
      path: S3_API_ROUTES.delete,
      run: (api: Client) => api.delete({ route: "uploads", key: "a.png" }),
    },
    {
      name: "deleteMany",
      method: "POST",
      path: S3_API_ROUTES.deleteMany,
      run: (api: Client) =>
        api.deleteMany({ route: "uploads", keys: ["uploads/a.png"] }),
    },
    {
      name: "multipart.init",
      method: "POST",
      path: S3_API_ROUTES.multipartInit,
      run: (api: Client) =>
        api.multipart.init({ route: "uploads", name: "a.bin", size: 10 }),
    },
    {
      name: "multipart.signPart",
      method: "POST",
      path: S3_API_ROUTES.multipartSignPart,
      run: (api: Client) => api.multipart.signPart({ ticket, partNumber: 1 }),
    },
    {
      name: "multipart.listParts",
      method: "POST",
      path: S3_API_ROUTES.multipartListParts,
      run: (api: Client) => api.multipart.listParts({ ticket }),
    },
    {
      name: "multipart.complete",
      method: "POST",
      path: S3_API_ROUTES.multipartComplete,
      run: (api: Client) => api.multipart.complete({ ticket }),
    },
    {
      name: "multipart.abort",
      method: "POST",
      path: S3_API_ROUTES.multipartAbort,
      run: (api: Client) => api.multipart.abort({ ticket }),
    },
  ])("$name → $method $path", async ({ method, path, run }) => {
    const { fetch, calls } = captureFetch(() =>
      jsonResponse({ url: "https://bucket.example.com/a" }),
    );
    await run(createS3Client({ fetch }));
    expect(calls[0]?.init.method).toBe(method);
    expect(new URL(calls[0]?.url ?? "", "http://localhost").pathname).toBe(
      `${S3_API_BASE_PATH}${path}`,
    );
  });

  it("sends the upload payload as the JSON body", async () => {
    const { fetch, calls } = captureFetch();
    await createS3Client({ fetch }).upload(uploadBody);
    expect(jsonBody(calls[0]?.init)).toEqual(uploadBody);
  });

  it("sends listParts as a POST with the ticket in the body", async () => {
    const { fetch, calls } = captureFetch();
    await createS3Client({ fetch }).multipart.listParts({ ticket });
    expect(calls[0]?.init.method).toBe("POST");
    expect(calls[0]?.url).not.toContain("ticket");
    expect(jsonBody(calls[0]?.init)).toEqual({ ticket });
  });

  it("fits the download name to the wire rule and forwards the route", async () => {
    const { fetch, calls } = captureFetch(() => jsonResponse({ url: "x" }));
    await createS3Client({ fetch }).download({
      route: "uploads",
      key: "a.png",
      name: ' quote"na	me.png ',
    });
    // The same rule as an upload name: control characters go, quotes stay.
    expect(
      new URL(calls[0]?.url ?? "", "http://x").searchParams.get("name"),
    ).toBe('quote"name.png');
    expect(calls[0]?.url).toContain("route=uploads");
  });

  it("forwards download expiresIn", async () => {
    const { fetch, calls } = captureFetch(() => jsonResponse({ url: "x" }));
    await createS3Client({ fetch }).download({
      route: "uploads",
      key: "a.png",
      expiresIn: 900,
    });
    expect(calls[0]?.url).toContain("expiresIn=900");
  });

  it("uses a custom basePath", async () => {
    const { fetch, calls } = captureFetch();
    await createS3Client({ fetch, basePath: "/s3/" }).upload(uploadBody);
    expect(calls[0]?.url.startsWith("/s3/")).toBe(true);
  });

  it("uses baseURL over basePath", async () => {
    const { fetch, calls } = captureFetch();
    await createS3Client({
      fetch,
      basePath: "/api/s3",
      baseURL: "https://api.example.com/s3",
    }).upload(uploadBody);
    expect(calls[0]?.url.startsWith("https://api.example.com/s3/")).toBe(true);
  });

  it("exposes $fetch", () => {
    expect(typeof createS3Client().$fetch).toBe("function");
  });
});

describe("createS3Client download URLs", () => {
  const proxyUrl = "/api/s3/file?route=uploads&key=a.png";

  function downloadWith(url: string, base: { baseURL?: string }) {
    const { fetch } = captureFetch(() =>
      jsonResponse({ key: "a.png", url, mode: "proxy" }),
    );
    return createS3Client({ fetch, ...base }).download({
      route: "uploads",
      key: "a.png",
    });
  }

  it("resolves a proxy URL against the origin of an absolute baseURL", async () => {
    const result = await downloadWith(proxyUrl, {
      baseURL: "https://api.example.com/api/s3",
    });
    expect(result.url).toBe(`https://api.example.com${proxyUrl}`);
    expect(result).toMatchObject({ key: "a.png", mode: "proxy" });
  });

  it("keeps a proxy URL as is under a relative base", async () => {
    const result = await downloadWith(proxyUrl, {});
    expect(result.url).toBe(proxyUrl);
  });

  it.each([
    "https://bucket.s3.amazonaws.com/a.png?X-Amz-Signature=x",
    "//cdn.example.com/a.png",
  ])("keeps %s as is", async (url) => {
    const result = await downloadWith(url, {
      baseURL: "https://api.example.com/api/s3",
    });
    expect(result.url).toBe(url);
  });
});

describe("createS3Client errors", () => {
  it("rebuilds a JSON error body and keeps the HTTP status", async () => {
    const fetch = async () =>
      jsonResponse(
        {
          code: S3_ERROR_CODES.FILE_TOO_LARGE.code,
          message: "File is 20 bytes; the limit is 10 bytes",
          params: { size: 20, maxFileSize: 10 },
        },
        413,
      );
    const api = createS3Client({ fetch });

    await expect(api.upload(uploadBody)).rejects.toMatchObject({
      name: "APIError",
      statusCode: 413,
      code: "FILE_TOO_LARGE",
      message: "File is 20 bytes; the limit is 10 bytes",
      params: { size: 20, maxFileSize: 10 },
    });
    await expect(
      api.download({ route: "uploads", key: "missing" }),
    ).rejects.toBeInstanceOf(APIError);
  });

  it("keeps plugin-defined codes", async () => {
    const fetch = async () =>
      jsonResponse({ code: "PLUGIN_LIMIT", message: "Slow down" }, 429);

    await expect(createS3Client({ fetch }).catalog()).rejects.toMatchObject({
      statusCode: 429,
      code: "PLUGIN_LIMIT",
      message: "Slow down",
    });
  });

  it("maps a non-JSON 502 onto INTERNAL_ERROR with status 502", async () => {
    const fetch = async () => htmlResponse(502, "Bad Gateway");

    await expect(
      createS3Client({ fetch }).download({ route: "uploads", key: "a.png" }),
    ).rejects.toMatchObject({
      name: "APIError",
      statusCode: 502,
      code: "INTERNAL_ERROR",
      message: S3_ERROR_CODES.INTERNAL_ERROR.message,
    });
  });

  it("maps a non-JSON 404 onto UNKNOWN_ERROR with status 404", async () => {
    const fetch = async () => htmlResponse(404, "Not Found");

    await expect(
      createS3Client({ fetch }).delete({ route: "uploads", key: "a.png" }),
    ).rejects.toMatchObject({
      name: "APIError",
      statusCode: 404,
      code: "UNKNOWN_ERROR",
    });
  });

  it("maps JSON without a code onto UNKNOWN_ERROR", async () => {
    const fetch = async () => jsonResponse({ error: "nope" }, 400);

    await expect(createS3Client({ fetch }).catalog()).rejects.toMatchObject({
      statusCode: 400,
      code: "UNKNOWN_ERROR",
    });
  });

  it("exposes $ERROR_CODES on the client", () => {
    expect(createS3Client().$ERROR_CODES).toBe(S3_ERROR_CODES);
  });
});

describe("createS3Client options", () => {
  it.each([
    { Authorization: "Bearer t" },
    async () => ({ Authorization: "Bearer t" }),
  ])("attaches client headers to every request", async (headers) => {
    const { fetch, calls } = captureFetch();
    await createS3Client({ fetch, headers }).confirm({ ticket });
    expect(new Headers(calls[0]?.init.headers).get("authorization")).toBe(
      "Bearer t",
    );
  });

  it.each<HeadersInit>([
    { Authorization: "Bearer call", "X-Trace": "1" },
    new Headers({ Authorization: "Bearer call", "X-Trace": "1" }),
    [
      ["Authorization", "Bearer call"],
      ["X-Trace", "1"],
    ],
  ])("lets per-call headers override client headers", async (callHeaders) => {
    const { fetch, calls } = captureFetch();
    await createS3Client({
      fetch,
      headers: { Authorization: "Bearer client", "X-Client": "web" },
    }).confirm({ ticket }, { headers: callHeaders });

    const sent = new Headers(calls[0]?.init.headers);
    expect(sent.get("authorization")).toBe("Bearer call");
    expect(sent.get("x-trace")).toBe("1");
    expect(sent.get("x-client")).toBe("web");
  });

  it("forwards the per-call signal", async () => {
    const { fetch, calls } = captureFetch();
    const controller = new AbortController();
    await createS3Client({ fetch }).multipart.signPart(
      { ticket, partNumber: 1 },
      { signal: controller.signal },
    );
    expect(calls[0]?.init.signal).toBe(controller.signal);
  });

  it("rejects with the abort reason when the signal aborts", async () => {
    const fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
      init?.signal?.throwIfAborted();
      return jsonResponse({});
    };
    const controller = new AbortController();
    const reason = new DOMException("Stopped", "AbortError");
    controller.abort(reason);

    await expect(
      createS3Client({ fetch }).catalog({ signal: controller.signal }),
    ).rejects.toBe(reason);
  });
});

describe("createS3Client plugins", () => {
  it("mounts getActions onto the api object", async () => {
    const { fetch, calls } = captureFetch();
    const api = createS3Client({
      fetch,
      plugins: [
        defineClientPlugin({
          id: "db",
          getActions: ($fetch) => ({
            listObjects: () =>
              $fetch(pluginPath("db", "objects"), { method: "GET" }),
          }),
        }),
      ],
    });

    await api.db.listObjects();
    expect(calls[0]?.url).toContain("/db/objects");
  });

  it("rejects reserved and duplicate plugin ids", () => {
    expect(() =>
      createS3Client({
        plugins: [defineClientPlugin({ id: "upload", getActions: () => ({}) })],
      }),
    ).toThrow(/reserved/);

    expect(() =>
      createS3Client({
        plugins: [
          defineClientPlugin({ id: "db", getActions: () => ({}) }),
          defineClientPlugin({ id: "db", getActions: () => ({}) }),
        ],
      }),
    ).toThrow(/Duplicate/);
  });
});
