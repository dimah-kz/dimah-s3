import { S3_API_ROUTES, S3_ERROR_CODES } from "@dimah-s3/core";
import { describe, expect, it, vi } from "vitest";
import { DimahS3Error } from "./errors";
import { createS3Endpoint, definePlugin } from "./index";
import { route } from "./route";
import {
  apiUrl,
  createInstance,
  defaultUploadBody,
  expectErrorCode,
  jsonRequest,
} from "./test/harness";

describe("dimahS3 instance", () => {
  it("exposes handler, api, flattened context, and getPlugin", () => {
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
    expect(s3.$ERROR_CODES).toBe(S3_ERROR_CODES);
    expect(s3.api.multipart.init).toBe(s3.api.multipartInit);
  });

  it("honors a custom basePath", async () => {
    const s3 = createInstance({
      basePath: "/s3/",
    });
    const res = await s3.handler(
      jsonRequest(apiUrl(S3_API_ROUTES.upload, "/s3"), { body: {} }),
    );
    await expectErrorCode(res, 400, S3_ERROR_CODES.VALIDATION_ERROR);
  });
});

describe("HTTP envelope", () => {
  it("returns JSON VALIDATION_ERROR for an invalid body", async () => {
    const s3 = createInstance();
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

  it("returns UNKNOWN_ROUTE for an unknown file route", async () => {
    const s3 = createInstance();
    const res = await s3.handler(
      jsonRequest(apiUrl(S3_API_ROUTES.upload), {
        body: { ...defaultUploadBody, route: "missing" },
      }),
    );
    await expectErrorCode(res, 404, S3_ERROR_CODES.UNKNOWN_ROUTE);
  });

  it("runs the global guard before the endpoint", async () => {
    const s3 = createInstance({
      guard: () => {
        throw DimahS3Error.from("FORBIDDEN", {
          ...S3_ERROR_CODES.FORBIDDEN,
          message: "blocked",
        });
      },
    });
    const res = await s3.handler(
      jsonRequest(apiUrl(S3_API_ROUTES.upload), { body: defaultUploadBody }),
    );
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({
      code: S3_ERROR_CODES.FORBIDDEN.code,
      message: "blocked",
    });
  });

  it("serializes DimahS3Error params through native APIError JSON", async () => {
    const s3 = createInstance({
      guard: () => {
        throw new DimahS3Error("FORBIDDEN", {
          message: "quota",
          code: "QUOTA",
          params: { used: 12 },
        });
      },
    });
    const res = await s3.handler(
      jsonRequest(apiUrl(S3_API_ROUTES.upload), { body: defaultUploadBody }),
    );
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({
      message: "quota",
      code: "QUOTA",
      params: { used: 12 },
    });
  });

  it("maps unexpected throws to INTERNAL_ERROR JSON", async () => {
    const s3 = createInstance({
      plugins: [
        definePlugin({
          id: "boom",
          endpoints: {
            boom: createS3Endpoint("/boom", { method: "GET" }, async () => {
              throw new Error("AccessDenied: secret internals");
            }),
          },
        }),
      ],
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await s3.handler(
      new Request(apiUrl("/boom"), { method: "GET" }),
    );
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      message: "Internal server error",
      code: S3_ERROR_CODES.INTERNAL_ERROR.code,
    });
    spy.mockRestore();
  });

  it("maps network codes to S3_NETWORK_ERROR JSON", async () => {
    const s3 = createInstance({
      plugins: [
        definePlugin({
          id: "net",
          endpoints: {
            ping: createS3Endpoint("/net", { method: "GET" }, async () => {
              throw Object.assign(new Error("connect"), {
                code: "ECONNREFUSED",
              });
            }),
          },
        }),
      ],
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await s3.handler(
      new Request(apiUrl("/net"), { method: "GET" }),
    );
    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toMatchObject({
      code: S3_ERROR_CODES.S3_NETWORK_ERROR.code,
      params: { code: "ECONNREFUSED" },
    });
    spy.mockRestore();
  });

  it.each([
    {
      feature: "upload" as const,
      method: "POST",
      path: S3_API_ROUTES.upload,
      body: defaultUploadBody,
      routes: { uploads: route({ upload: false, download: true }) },
    },
    {
      feature: "download" as const,
      method: "GET",
      path: `${S3_API_ROUTES.download}?route=uploads&key=a.png`,
      routes: { uploads: route({ upload: true, download: false }) },
    },
    {
      feature: "delete" as const,
      method: "DELETE",
      path: `${S3_API_ROUTES.delete}?route=uploads&key=a.png`,
      routes: { uploads: route({ upload: true, delete: false }) },
    },
    {
      feature: "multipart" as const,
      method: "POST",
      path: S3_API_ROUTES.multipartInit,
      body: defaultUploadBody,
      routes: { uploads: route({ upload: true, multipart: false }) },
    },
  ])(
    "returns FEATURE_DISABLED when $feature is disabled",
    async ({ method, path, body, routes }) => {
      const s3 = createInstance({ routes });
      const res = await s3.handler(jsonRequest(apiUrl(path), { method, body }));
      await expectErrorCode(res, 404, S3_ERROR_CODES.FEATURE_DISABLED);
    },
  );
});

describe("s3.api", () => {
  it("throws DimahS3Error on validation failures", async () => {
    const s3 = createInstance();
    await expect(
      s3.api.download({ query: { route: "uploads", key: "" } }),
    ).rejects.toMatchObject({
      name: "DimahS3Error",
      code: S3_ERROR_CODES.VALIDATION_ERROR.code,
      status: "BAD_REQUEST",
      statusCode: 400,
    });
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
