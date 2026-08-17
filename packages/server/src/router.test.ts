import { describe, expect, it } from "vitest";
import { DimahS3Error, S3_ERROR_CODES } from "@dimah-s3/core";
import { dimahS3 } from "./dimah-s3";
import { createS3Endpoint, definePlugin } from "./index";
import type { DimahS3Config } from "./types";

function instance(
  overrides: Partial<DimahS3Config> & {
    plugins?: DimahS3Config["plugins"];
  } = {},
) {
  return dimahS3({
    s3: {} as DimahS3Config["s3"],
    defaultBucket: "bucket",
    ...overrides,
  });
}

describe("dimahS3 router", () => {
  it("returns JSON VALIDATION_ERROR for invalid upload body", async () => {
    const s3 = instance({ upload: { enabled: true } });
    const res = await s3.handler(
      new Request("http://localhost/api/s3/presign/upload", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      code: S3_ERROR_CODES.VALIDATION_ERROR,
    });
  });

  it("returns JSON NOT_FOUND when upload is disabled", async () => {
    const s3 = instance({ upload: { enabled: false } });
    const res = await s3.handler(
      new Request("http://localhost/api/s3/presign/upload", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: "a.png" }),
      }),
    );
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({
      code: S3_ERROR_CODES.NOT_FOUND,
    });
  });

  it("runs guard before the endpoint", async () => {
    const s3 = instance({
      upload: { enabled: true },
      guard: () => {
        throw new DimahS3Error("blocked", 403, {
          code: S3_ERROR_CODES.FORBIDDEN,
        });
      },
    });
    const res = await s3.handler(
      new Request("http://localhost/api/s3/presign/upload", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: "a.png" }),
      }),
    );
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({
      code: S3_ERROR_CODES.FORBIDDEN,
      message: "blocked",
    });
  });

  it("returns JSON NOT_FOUND for unknown paths", async () => {
    const s3 = instance();
    const res = await s3.handler(
      new Request("http://localhost/api/s3/nope", { method: "GET" }),
    );
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({
      code: S3_ERROR_CODES.NOT_FOUND,
    });
  });

  it("mounts plugin endpoints on the handler and s3.api", async () => {
    const s3 = instance({
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
      new Request("http://localhost/api/s3/audit/recent", { method: "GET" }),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ events: [] });

    await expect(s3.api.recent({})).resolves.toEqual({ events: [] });
  });

  it("maps s3.api validation failures to DimahS3Error", async () => {
    const s3 = instance({ download: { enabled: true } });
    await expect(s3.api.download({ query: { key: "" } })).rejects.toMatchObject(
      {
        name: "DimahS3Error",
        code: S3_ERROR_CODES.VALIDATION_ERROR,
        status: 400,
      },
    );
  });
});
