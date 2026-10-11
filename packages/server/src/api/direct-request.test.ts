import { S3_API_ROUTES } from "@dimah-s3/core";
import { describe, expect, it, vi } from "vitest";
import * as z from "zod";
import { createS3Endpoint } from "@/api/create-s3-endpoint";
import {
  allFeaturesRoute,
  apiUrl,
  createInstance,
  defaultUploadBody,
  headResult,
  jsonRequest,
  mockS3,
  sendByCommand,
  storedPngKey,
} from "@/test/harness";

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn(async () => "https://s3.test/signed"),
}));

vi.mock("@aws-sdk/s3-presigned-post", () => ({
  createPresignedPost: vi.fn(async () => ({
    url: "https://s3.test/post",
    fields: { key: "a.png", Policy: "p" },
  })),
}));

const uploadBody = {
  ...defaultUploadBody,
  metadata: { ownerKind: "org" },
};

function headClient() {
  return mockS3(sendByCommand({ HeadObjectCommand: headResult() }) as never);
}

describe("hook request", () => {
  it("leaves the HTTP JSON body readable after better-call parses it", async () => {
    const seen: unknown[] = [];
    const s3 = createInstance({
      guard: async ({ request }) => {
        seen.push(await request.clone().json());
      },
      routes: {
        uploads: allFeaturesRoute({
          guard: async ({ request }) => {
            seen.push(await request.clone().json());
          },
        }),
      },
    });

    const res = await s3.handler(
      jsonRequest(apiUrl(S3_API_ROUTES.upload), { body: uploadBody }),
    );

    expect(res.status).toBe(200);
    expect(seen).toEqual([uploadBody, uploadBody]);
  });

  it("replays a direct upload body onto the hook request", async () => {
    const seen: unknown[] = [];
    let method = "";
    const s3 = createInstance({
      guard: async ({ request }) => {
        method = request.method;
        seen.push(await request.clone().json());
      },
      routes: {
        uploads: allFeaturesRoute({
          guard: async ({ request }) => {
            seen.push(await request.clone().json());
          },
        }),
      },
    });

    await expect(s3.api.upload({ body: uploadBody })).resolves.toMatchObject({
      method: "POST",
    });
    expect(method).toBe("POST");
    expect(seen).toEqual([uploadBody, uploadBody]);
  });

  it("replays a direct confirm body onto the hook request", async () => {
    let seen: unknown;
    const body = { route: "uploads", key: storedPngKey };
    const s3 = createInstance({
      client: headClient(),
      guard: async ({ request }) => {
        seen = await request.clone().json();
      },
    });

    await s3.api.confirm({ body });
    expect(seen).toEqual(body);
  });

  it("puts a direct delete query on the hook request URL", async () => {
    let seen: Request | undefined;
    const s3 = createInstance({
      client: headClient(),
      basePath: "/s3/",
      routes: {
        uploads: allFeaturesRoute({
          guard: ({ request }) => {
            seen = request;
          },
        }),
      },
    });

    await s3.api.delete({
      query: { route: "uploads", key: storedPngKey },
      headers: { cookie: "session=abc" },
    });

    if (!seen) throw new Error("guard did not run");
    expect(seen.method).toBe("DELETE");
    expect(seen.headers.get("cookie")).toBe("session=abc");
    expect(seen.body).toBeNull();
    const url = new URL(seen.url);
    expect(url.origin).toBe("http://dimah-s3.local");
    expect(url.pathname).toBe("/s3/delete");
    expect(url.searchParams.get("route")).toBe("uploads");
    expect(url.searchParams.get("key")).toBe(storedPngKey);
  });

  it("uses a caller-supplied request unchanged", async () => {
    const incoming = new Request("http://app.local/already", {
      method: "DELETE",
      headers: { cookie: "session=abc" },
    });
    let seen: Request | undefined;
    const s3 = createInstance({
      client: headClient(),
      guard: ({ request }) => {
        seen = request;
      },
    });

    await s3.api.delete({
      query: { route: "uploads", key: storedPngKey },
      request: incoming,
    });

    expect(seen).toBe(incoming);
  });

  it("keeps an explicit cloneRequest: false", () => {
    const endpoint = createS3Endpoint(
      "/note",
      {
        method: "POST",
        body: z.object({ a: z.string() }),
        cloneRequest: false,
      },
      async () => ({ ok: true }),
    );

    expect(endpoint.options.cloneRequest).toBe(false);
  });
});
