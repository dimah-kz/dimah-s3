import { describe, expect, it, vi } from "vitest";
import { createS3Client } from "./create-s3-client";
import { DimahS3Error, S3_ERROR_CODES } from "./error";
import { defineClientPlugin } from "./plugin/define-client-plugin";
import { pluginPath } from "./plugin/plugin-path";
import { S3_API_ROUTES } from "./routes";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function captureFetch() {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return jsonResponse({ ok: true });
  });
  return { fetch, calls };
}

describe("createS3Client", () => {
  it("posts upload payloads to the core route without headers", async () => {
    const { fetch, calls } = captureFetch();
    const api = createS3Client({ fetch });

    await api.upload({
      key: "a.png",
      headers: { Authorization: "secret" },
    });

    expect(calls[0]?.url).toContain(S3_API_ROUTES.upload);
    expect(calls[0]?.init.method).toBe("POST");
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ key: "a.png" });
  });

  it("sends download as GET with a sanitized fileName query", async () => {
    const { fetch, calls } = captureFetch();
    const api = createS3Client({ fetch });

    await api.download("a.png", { fileName: 'quote"name.png', bucket: "b" });

    expect(calls[0]?.url).toContain(S3_API_ROUTES.download);
    expect(calls[0]?.init.method).toBe("GET");
    expect(calls[0]?.url).toContain("fileName=quote_name.png");
    expect(calls[0]?.url).toContain("bucket=b");
  });

  it("maps non-OK JSON bodies onto DimahS3Error", async () => {
    const fetch = vi.fn(async () =>
      jsonResponse(
        {
          message: "blocked",
          code: S3_ERROR_CODES.FORBIDDEN,
          params: { name: "key" },
        },
        403,
      ),
    );
    const api = createS3Client({ fetch });

    await expect(api.delete("a.png")).rejects.toMatchObject({
      name: "DimahS3Error",
      status: 403,
      code: S3_ERROR_CODES.FORBIDDEN,
      message: "blocked",
      params: { name: "key" },
    });
    expect(fetch.mock.calls[0]?.[0]).toEqual(
      expect.stringContaining(S3_API_ROUTES.delete),
    );
  });

  it("attaches static and factory headers to every request", async () => {
    const { fetch, calls } = captureFetch();
    const api = createS3Client({
      fetch,
      headers: async () => ({ Authorization: "Bearer t" }),
    });

    await api.confirm({ key: "a.png" });

    const headers = new Headers(calls[0]?.init.headers);
    expect(headers.get("authorization")).toBe("Bearer t");
  });

  it("mounts client plugins onto the api object", async () => {
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
        plugins: [
          defineClientPlugin({
            id: "upload",
            getActions: () => ({}),
          }),
        ],
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

  it("uses a custom basePath", async () => {
    const { fetch, calls } = captureFetch();
    const api = createS3Client({ fetch, basePath: "/s3/" });
    await api.upload({ key: "a.png" });
    expect(calls[0]?.url.startsWith("/s3/")).toBe(true);
  });
});

describe("DimahS3Error from fetch", () => {
  it("is an instance of DimahS3Error", async () => {
    const fetch = vi.fn(async () => jsonResponse({ message: "nope" }, 404));
    const api = createS3Client({ fetch });
    await expect(api.download("missing")).rejects.toBeInstanceOf(DimahS3Error);
  });
});
