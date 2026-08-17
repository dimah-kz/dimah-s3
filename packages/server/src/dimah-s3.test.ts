import { S3_API_ROUTES, S3_ERROR_CODES } from "@dimah-s3/core";
import { describe, expect, it } from "vitest";
import { DimahS3Error } from "./errors";
import { createS3Endpoint, definePlugin } from "./index";
import {
  apiUrl,
  createInstance,
  expectErrorCode,
  jsonRequest,
} from "./test/harness";

describe("dimahS3", () => {
  it("exposes handler, api, context, and getPlugin", () => {
    const plugin = definePlugin({
      id: "audit",
      context: { events: [] as string[] },
    });
    const s3 = createInstance({ plugins: [plugin] });

    expect(typeof s3.handler).toBe("function");
    expect(s3.api.upload).toBeTypeOf("function");
    expect(s3.context.audit).toEqual({ events: [] });
    expect(s3.audit).toBe(s3.context.audit);
    expect(s3.getPlugin("audit")).toBe(plugin);
    expect(s3.getPlugin("missing")).toBeUndefined();
  });

  it("honors a custom basePath", async () => {
    const s3 = createInstance({
      basePath: "/s3/",
      upload: { enabled: true },
    });
    const res = await s3.handler(
      jsonRequest(apiUrl(S3_API_ROUTES.upload, "/s3"), { body: {} }),
    );
    await expectErrorCode(res, 400, S3_ERROR_CODES.VALIDATION_ERROR);
  });
});

describe("HTTP error envelope", () => {
  it("returns JSON VALIDATION_ERROR for an invalid upload body", async () => {
    const s3 = createInstance({ upload: { enabled: true } });
    const res = await s3.handler(
      jsonRequest(apiUrl(S3_API_ROUTES.upload), { body: {} }),
    );
    await expectErrorCode(res, 400, S3_ERROR_CODES.VALIDATION_ERROR);
  });

  it("returns JSON NOT_FOUND for unknown paths", async () => {
    const s3 = createInstance();
    const res = await s3.handler(
      new Request("http://localhost/api/s3/nope", { method: "GET" }),
    );
    await expectErrorCode(res, 404, S3_ERROR_CODES.NOT_FOUND);
  });

  it("runs the global guard before the endpoint", async () => {
    const s3 = createInstance({
      upload: { enabled: true },
      guard: () => {
        throw new DimahS3Error("blocked", 403, {
          code: S3_ERROR_CODES.FORBIDDEN,
        });
      },
    });
    const res = await s3.handler(
      jsonRequest(apiUrl(S3_API_ROUTES.upload), { body: { key: "a.png" } }),
    );
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({
      code: S3_ERROR_CODES.FORBIDDEN,
      message: "blocked",
    });
  });

  it.each([
    {
      feature: "upload" as const,
      method: "POST",
      path: S3_API_ROUTES.upload,
      body: { key: "a.png" },
    },
    {
      feature: "download" as const,
      method: "GET",
      path: `${S3_API_ROUTES.download}?key=a.png`,
    },
    {
      feature: "delete" as const,
      method: "DELETE",
      path: `${S3_API_ROUTES.delete}?key=a.png`,
    },
    {
      feature: "multipart" as const,
      method: "POST",
      path: S3_API_ROUTES.multipartInit,
      body: { key: "a.png" },
    },
  ])(
    "returns NOT_FOUND when $feature is disabled",
    async ({ feature, method, path, body }) => {
      const s3 = createInstance({ [feature]: { enabled: false } });
      const res = await s3.handler(jsonRequest(apiUrl(path), { method, body }));
      await expectErrorCode(res, 404, S3_ERROR_CODES.NOT_FOUND);
    },
  );
});

describe("s3.api", () => {
  it("maps validation failures to DimahS3Error", async () => {
    const s3 = createInstance({ download: { enabled: true } });
    await expect(s3.api.download({ query: { key: "" } })).rejects.toMatchObject(
      {
        name: "DimahS3Error",
        code: S3_ERROR_CODES.VALIDATION_ERROR,
        status: 400,
      },
    );
  });
});

describe("plugin endpoints", () => {
  it("mounts plugin routes on the handler and s3.api", async () => {
    const s3 = createInstance({
      plugins: [
        definePlugin({
          id: "audit",
          endpoints: {
            recent: createS3Endpoint(
              "/audit/recent",
              { method: "GET" },
              async () => ({ events: [] }),
            ),
          },
        }),
      ],
    });

    const res = await s3.handler(
      new Request(apiUrl("/audit/recent"), { method: "GET" }),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ events: [] });
    await expect(s3.api.recent({})).resolves.toEqual({ events: [] });
  });
});

describe("protocol routes", () => {
  it.each([
    { method: "POST", path: S3_API_ROUTES.upload, feature: "upload" as const },
    {
      method: "POST",
      path: S3_API_ROUTES.uploadConfirm,
      feature: "upload" as const,
    },
    {
      method: "GET",
      path: S3_API_ROUTES.download,
      feature: "download" as const,
    },
    {
      method: "DELETE",
      path: S3_API_ROUTES.delete,
      feature: "delete" as const,
    },
    {
      method: "POST",
      path: S3_API_ROUTES.multipartInit,
      feature: "multipart" as const,
    },
    {
      method: "POST",
      path: S3_API_ROUTES.multipartPart,
      feature: "multipart" as const,
    },
    {
      method: "GET",
      path: S3_API_ROUTES.multipartListParts,
      feature: "multipart" as const,
    },
    {
      method: "POST",
      path: S3_API_ROUTES.multipartComplete,
      feature: "multipart" as const,
    },
    {
      method: "POST",
      path: S3_API_ROUTES.multipartAbort,
      feature: "multipart" as const,
    },
  ])(
    "$method $path is registered (not 404) when enabled",
    async ({ method, path, feature }) => {
      const s3 = createInstance({ [feature]: { enabled: true } });
      const res = await s3.handler(
        jsonRequest(apiUrl(path), { method, body: {} }),
      );
      expect(res.status).not.toBe(404);
      expect(res.status).toBeGreaterThanOrEqual(400);
    },
  );
});
