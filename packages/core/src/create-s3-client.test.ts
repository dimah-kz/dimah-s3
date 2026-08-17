import { describe, expect, it } from "vitest";
import { createS3Client } from "./create-s3-client";
import { DimahS3Error, S3_ERROR_CODES } from "./error";
import { defineClientPlugin } from "./plugin/define-client-plugin";
import { pluginPath } from "./plugin/plugin-path";
import { S3_API_ROUTES } from "./routes";
import { captureFetch, jsonResponse } from "./test/http";

describe("createS3Client protocol", () => {
  it.each([
    {
      name: "upload",
      method: "POST",
      path: S3_API_ROUTES.upload,
      run: (api: ReturnType<typeof createS3Client>) =>
        api.upload({ key: "a.png" }),
    },
    {
      name: "confirm",
      method: "POST",
      path: S3_API_ROUTES.uploadConfirm,
      run: (api: ReturnType<typeof createS3Client>) =>
        api.confirm({ key: "a.png" }),
    },
    {
      name: "download",
      method: "GET",
      path: S3_API_ROUTES.download,
      run: (api: ReturnType<typeof createS3Client>) => api.download("a.png"),
    },
    {
      name: "delete",
      method: "DELETE",
      path: S3_API_ROUTES.delete,
      run: (api: ReturnType<typeof createS3Client>) => api.delete("a.png"),
    },
    {
      name: "multipart.init",
      method: "POST",
      path: S3_API_ROUTES.multipartInit,
      run: (api: ReturnType<typeof createS3Client>) =>
        api.multipart.init({ key: "a.bin" }),
    },
    {
      name: "multipart.signPart",
      method: "POST",
      path: S3_API_ROUTES.multipartPart,
      run: (api: ReturnType<typeof createS3Client>) =>
        api.multipart.signPart({
          key: "a.bin",
          uploadId: "up-1",
          partNumber: 1,
        }),
    },
    {
      name: "multipart.listParts",
      method: "GET",
      path: S3_API_ROUTES.multipartListParts,
      run: (api: ReturnType<typeof createS3Client>) =>
        api.multipart.listParts({ key: "a.bin", uploadId: "up-1" }),
    },
    {
      name: "multipart.complete",
      method: "POST",
      path: S3_API_ROUTES.multipartComplete,
      run: (api: ReturnType<typeof createS3Client>) =>
        api.multipart.complete({
          key: "a.bin",
          uploadId: "up-1",
          parts: [{ partNumber: 1 }],
        }),
    },
    {
      name: "multipart.abort",
      method: "POST",
      path: S3_API_ROUTES.multipartAbort,
      run: (api: ReturnType<typeof createS3Client>) =>
        api.multipart.abort({ key: "a.bin", uploadId: "up-1" }),
    },
  ])("$name → $method $path", async ({ method, path, run }) => {
    const { fetch, calls } = captureFetch();
    await run(createS3Client({ fetch }));
    expect(calls[0]?.init.method).toBe(method);
    expect(calls[0]?.url).toContain(path);
  });

  it("strips server-only headers from the upload body", async () => {
    const { fetch, calls } = captureFetch();
    await createS3Client({ fetch }).upload({
      key: "a.png",
      headers: { Authorization: "secret" },
    });
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ key: "a.png" });
  });

  it("sanitizes download fileName and forwards bucket", async () => {
    const { fetch, calls } = captureFetch();
    await createS3Client({ fetch }).download("a.png", {
      fileName: 'quote"name.png',
      bucket: "b",
    });
    expect(calls[0]?.url).toContain("fileName=quote_name.png");
    expect(calls[0]?.url).toContain("bucket=b");
  });

  it("uses a custom basePath", async () => {
    const { fetch, calls } = captureFetch();
    await createS3Client({ fetch, basePath: "/s3/" }).upload({ key: "a.png" });
    expect(calls[0]?.url.startsWith("/s3/")).toBe(true);
  });
});

describe("createS3Client errors", () => {
  it("maps non-OK JSON onto DimahS3Error", async () => {
    const fetch = async () =>
      jsonResponse(
        {
          message: "blocked",
          code: S3_ERROR_CODES.FORBIDDEN,
          params: { name: "key" },
        },
        403,
      );
    const api = createS3Client({ fetch });

    await expect(api.delete("a.png")).rejects.toMatchObject({
      name: "DimahS3Error",
      status: 403,
      code: S3_ERROR_CODES.FORBIDDEN,
      message: "blocked",
      params: { name: "key" },
    });
    await expect(api.download("missing")).rejects.toBeInstanceOf(DimahS3Error);
  });

  it("maps non-JSON failures onto DimahS3Error without a code", async () => {
    const fetch = async () =>
      new Response("<html>oops</html>", {
        status: 502,
        statusText: "Bad Gateway",
        headers: { "content-type": "text/html" },
      });
    const api = createS3Client({ fetch });

    await expect(api.download("a.png")).rejects.toMatchObject({
      name: "DimahS3Error",
      status: 502,
      message: "Bad Gateway",
    });
  });
});

describe("createS3Client options", () => {
  it.each([
    { Authorization: "Bearer t" },
    async () => ({ Authorization: "Bearer t" }),
  ])("attaches headers to every request", async (headers) => {
    const { fetch, calls } = captureFetch();
    await createS3Client({ fetch, headers }).confirm({ key: "a.png" });
    expect(new Headers(calls[0]?.init.headers).get("authorization")).toBe(
      "Bearer t",
    );
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
