import { S3_API_ROUTES, S3_ERROR_CODES, s3Error } from "@dimah-s3/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createS3Endpoint } from "@/api/create-s3-endpoint";
import { definePlugin } from "@/plugin";
import { dimahS3 } from "./dimah-s3";
import { route } from "./route";
import {
  apiUrl,
  defaultUploadBody,
  expectErrorCode,
  jsonRequest,
  memoryS3,
  testInstanceConfig,
  TEST_SECRET,
  type MemoryS3,
} from "./test/harness";
import type { DimahS3Config } from "./types";

const DEV_SECRET = Symbol.for("dimah-s3.dev-secret");

function createInstance(overrides: Partial<DimahS3Config> = {}) {
  return dimahS3(testInstanceConfig(overrides));
}

/** An instance on {@link memoryS3}, so uploads can be presigned and received. */
function uploadInstance(s3: MemoryS3, overrides: Partial<DimahS3Config> = {}) {
  return createInstance({ client: s3.client, ...overrides });
}

/** Presigns through `s3.api`, then stores the bytes like S3 would. */
async function uploadThrough(
  s3: MemoryS3,
  instance: ReturnType<typeof createInstance>,
  options?: Parameters<typeof instance.api.upload>[1],
) {
  const presigned = await instance.api.upload(defaultUploadBody, options);
  if (presigned.method !== "PUT") throw new Error("expected a PUT upload");
  await s3.receiveUpload({
    key: presigned.key,
    body: "0123456789",
    headers: presigned.headers,
  });
  return presigned;
}

/** Records the request URL the guards see. */
function requestURL(overrides: Partial<DimahS3Config>) {
  let url: string | undefined;
  const instance = createInstance({
    ...overrides,
    guard: ({ request }) => {
      url = request.url;
    },
  });
  return instance.api.catalog().then(() => url);
}

describe("dimahS3 instance", () => {
  it("exposes handler, api, put, flattened context, and getPlugin", () => {
    const plugin = definePlugin({
      id: "audit",
      context: { events: [] as string[] },
    });
    const s3 = dimahS3({ ...testInstanceConfig(), plugins: [plugin] });

    expect(s3.handler).toBeTypeOf("function");
    expect(s3.put).toBeTypeOf("function");
    expect(Object.keys(s3.api).sort()).toEqual([
      "catalog",
      "confirm",
      "delete",
      "deleteMany",
      "download",
      "multipart",
      "upload",
    ]);
    expect(Object.keys(s3.api.multipart).sort()).toEqual([
      "abort",
      "complete",
      "init",
      "listParts",
      "signPart",
    ]);
    expect(s3.context.audit).toEqual({ events: [] });
    expect(s3.audit).toBe(s3.context.audit);
    expect(s3.getPlugin("audit")).toBe(plugin);
    expect(s3.getPlugin("missing")).toBeUndefined();
    expect(s3.$ERROR_CODES).toBe(S3_ERROR_CODES);
  });

  it("uploads from the server with s3.put", async () => {
    const s3 = memoryS3();
    const onStart = vi.fn();
    const instance = uploadInstance(s3, {
      routes: { uploads: route({ upload: { onStart } }) },
    });

    const object = await instance.put({
      route: "uploads",
      name: "a.txt",
      type: "text/plain",
      body: "hello",
    });

    expect(object).toMatchObject({ name: "a.txt", size: 5 });
    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "server", operation: "put" }),
    );
    expect(s3.get(object.key)?.body).toEqual(new TextEncoder().encode("hello"));
  });
});

describe("config", () => {
  it("builds in-process requests from basePath", async () => {
    await expect(requestURL({ basePath: "/files/" })).resolves.toBe(
      "http://localhost/files",
    );
  });

  it("builds in-process requests from baseURL", async () => {
    await expect(
      requestURL({ baseURL: "https://app.example.com/api/s3/" }),
    ).resolves.toBe("https://app.example.com/api/s3");
  });

  it("accepts a baseURL whose path matches basePath", async () => {
    await expect(
      requestURL({
        basePath: "/files",
        baseURL: "https://app.example.com/files/",
      }),
    ).resolves.toBe("https://app.example.com/files");
  });

  it.each([
    [
      { basePath: "/api/s3", baseURL: "https://app.example.com/files" },
      'the baseURL path "/files" must equal basePath "/api/s3"',
    ],
    [{ baseURL: "/api/s3" }, "baseURL must be an absolute http(s) URL"],
    [{ baseURL: "ftp://example.com/api/s3" }, "absolute http(s) URL"],
    [
      { baseURL: "https://example.com/api/s3?x=1" },
      "baseURL must not have a query or a hash",
    ],
    [{ maxExpiresIn: 0 }, "maxExpiresIn must be a positive integer"],
    [{ maxRequestBodySize: 1.5 }, "maxRequestBodySize must be a positive"],
    [{ secret: "too-short" }, "at least 32 characters"],
  ] satisfies [Partial<DimahS3Config>, string][])(
    "throws at construction for %j",
    (overrides, message) => {
      expect(() => createInstance(overrides)).toThrow(message);
    },
  );

  it("caps maxExpiresIn at the SigV4 limit", async () => {
    const s3 = createInstance({
      maxExpiresIn: 10_000_000,
      routes: { uploads: route({ download: { maxExpiresIn: 700_000 } }) },
    });
    const catalog = await s3.api.catalog();
    expect(catalog.routes.uploads.download).toMatchObject({
      maxExpiresIn: 604_800,
    });
  });

  it("runs plugin instance guards before the user guard", async () => {
    const order: string[] = [];
    const s3 = createInstance({
      plugins: [
        definePlugin({
          id: "auth",
          hooks: { guard: () => void order.push("plugin") },
        }),
      ],
      guard: () => void order.push("user"),
    });

    await s3.api.catalog();

    expect(order).toEqual(["plugin", "user"]);
  });
});

describe("upload ticket secret", () => {
  beforeEach(() => {
    delete (globalThis as { [DEV_SECRET]?: string })[DEV_SECRET];
    vi.stubEnv("DIMAH_S3_SECRET", "");
  });

  it.each([
    ["production", "production"],
    ["unset", undefined],
  ])(
    "fails the first upload with 500 when NODE_ENV is %s",
    async (_, nodeEnv) => {
      vi.stubEnv("NODE_ENV", nodeEnv);
      const error = vi.fn();
      const s3 = createInstance({ secret: undefined, logger: { error } });

      await expect(s3.api.upload(defaultUploadBody)).rejects.toMatchObject({
        code: "INTERNAL_ERROR",
        statusCode: 500,
      });
      expect(error).toHaveBeenCalledWith(
        expect.stringMatching(/^Config error: Set DIMAH_S3_SECRET/),
        expect.any(Error),
      );
    },
  );

  it("does not need a secret for calls without a ticket", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const s3 = createInstance({ secret: undefined, logger: false });
    await expect(s3.api.catalog()).resolves.toHaveProperty("routes.uploads");
  });

  it("uses a random development secret that survives a new instance", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const s3 = memoryS3();
    const warn = vi.fn();
    const first = uploadInstance(s3, { secret: undefined, logger: { warn } });

    const presigned = await uploadThrough(s3, first);
    await first.api.upload(defaultUploadBody);

    expect(warn).toHaveBeenCalledExactlyOnceWith(
      expect.stringMatching(/DIMAH_S3_SECRET is not set/),
    );
    const second = uploadInstance(s3, { secret: undefined, logger: {} });
    await expect(
      second.api.confirm({ ticket: presigned.ticket }),
    ).resolves.toMatchObject({ key: presigned.key, size: 10 });
  });

  it("reads DIMAH_S3_SECRET on first use", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DIMAH_S3_SECRET", TEST_SECRET);
    const s3 = memoryS3();
    const env = uploadInstance(s3, { secret: undefined });

    const presigned = await uploadThrough(s3, env);

    // A ticket signed with the env secret verifies with the same explicit secret.
    const explicit = uploadInstance(s3, { secret: TEST_SECRET });
    await expect(
      explicit.api.confirm({ ticket: presigned.ticket }),
    ).resolves.toMatchObject({ key: presigned.key });
  });

  it("fails lazily with 500 on a short DIMAH_S3_SECRET", async () => {
    vi.stubEnv("DIMAH_S3_SECRET", "too-short");
    const error = vi.fn();
    const s3 = createInstance({ secret: undefined, logger: { error } });

    await expect(s3.api.upload(defaultUploadBody)).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
    });
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("DIMAH_S3_SECRET must have at least 32"),
      expect.any(Error),
    );
  });

  it("verifies with every rotated secret", async () => {
    const s3 = memoryS3();
    const presigned = await uploadThrough(s3, uploadInstance(s3));
    const rotated = uploadInstance(s3, {
      secret: ["next-secret-0123456789abcdef-0123456789", TEST_SECRET],
    });

    await expect(
      rotated.api.confirm({ ticket: presigned.ticket }),
    ).resolves.toMatchObject({ key: presigned.key });
  });
});

describe("ticket subject", () => {
  type Locals = { userId?: string };
  const subject = ({ locals }: { locals: object }) => (locals as Locals).userId;

  it("binds tickets with the config ticketSubject", async () => {
    const s3 = memoryS3();
    const instance = uploadInstance(s3, { ticketSubject: subject });
    const presigned = await uploadThrough(s3, instance, {
      locals: { userId: "u1" },
    });

    await expect(
      instance.api.confirm(
        { ticket: presigned.ticket },
        { locals: { userId: "u2" } },
      ),
    ).rejects.toMatchObject({ code: "UPLOAD_TICKET_INVALID" });
    await expect(
      instance.api.confirm(
        { ticket: presigned.ticket },
        { locals: { userId: "u1" } },
      ),
    ).resolves.toMatchObject({ key: presigned.key });
  });

  it("falls back to the first plugin that provides one", async () => {
    const s3 = memoryS3();
    const pluginSubject = vi.fn(subject);
    const instance = uploadInstance(s3, {
      plugins: [
        definePlugin({ id: "none" }),
        definePlugin({ id: "scope", hooks: { ticketSubject: pluginSubject } }),
        definePlugin({
          id: "later",
          hooks: { ticketSubject: () => "ignored" },
        }),
      ],
    });
    const presigned = await uploadThrough(s3, instance, {
      locals: { userId: "u1" },
    });

    await expect(
      instance.api.confirm(
        { ticket: presigned.ticket },
        { locals: { userId: "u2" } },
      ),
    ).rejects.toMatchObject({ code: "UPLOAD_TICKET_INVALID" });
    expect(pluginSubject).toHaveBeenCalled();
  });

  it("prefers the config ticketSubject over a plugin's", async () => {
    const s3 = memoryS3();
    const pluginSubject = vi.fn(() => "plugin");
    const instance = uploadInstance(s3, {
      ticketSubject: () => "config",
      plugins: [
        definePlugin({ id: "scope", hooks: { ticketSubject: pluginSubject } }),
      ],
    });

    const presigned = await uploadThrough(s3, instance);

    await expect(
      instance.api.confirm({ ticket: presigned.ticket }),
    ).resolves.toMatchObject({ key: presigned.key });
    expect(pluginSubject).not.toHaveBeenCalled();
  });
});

describe("HTTP handler", () => {
  it("serves the catalog under a custom basePath", async () => {
    const s3 = createInstance({ basePath: "/s3/" });
    const res = await s3.handler(
      new Request(apiUrl(S3_API_ROUTES.catalog, "/s3")),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual(await s3.api.catalog());
  });

  it("returns JSON VALIDATION_ERROR for an invalid body", async () => {
    const s3 = createInstance();
    const res = await s3.handler(
      jsonRequest(apiUrl(S3_API_ROUTES.upload), { body: {} }),
    );
    await expectErrorCode(res, 400, S3_ERROR_CODES.VALIDATION_ERROR);
  });

  it("returns JSON NOT_FOUND for unknown paths", async () => {
    const s3 = createInstance();
    const res = await s3.handler(new Request(apiUrl("/nope")));
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

  it("returns the instance guard's error", async () => {
    const s3 = createInstance({
      guard: () => {
        throw s3Error("FORBIDDEN");
      },
    });
    const res = await s3.handler(
      jsonRequest(apiUrl(S3_API_ROUTES.upload), { body: defaultUploadBody }),
    );
    await expectErrorCode(res, 403, S3_ERROR_CODES.FORBIDDEN);
  });

  it.each([
    {
      feature: "upload",
      method: "POST",
      path: S3_API_ROUTES.upload,
      body: defaultUploadBody,
      routes: { uploads: route({ download: true }) },
    },
    {
      feature: "download",
      method: "GET",
      path: `${S3_API_ROUTES.download}?route=uploads&key=uploads/a.png`,
      routes: { uploads: route({ upload: true }) },
    },
    {
      feature: "delete",
      method: "DELETE",
      path: `${S3_API_ROUTES.delete}?route=uploads&key=uploads/a.png`,
      routes: { uploads: route({ upload: true }) },
    },
    {
      feature: "multipart",
      method: "POST",
      path: S3_API_ROUTES.multipartInit,
      body: defaultUploadBody,
      routes: { uploads: route({ upload: true }) },
    },
  ])(
    "returns FEATURE_DISABLED when $feature is off",
    async ({ method, path, body, routes }) => {
      const s3 = createInstance({ routes });
      const res = await s3.handler(jsonRequest(apiUrl(path), { method, body }));
      await expectErrorCode(res, 404, S3_ERROR_CODES.FEATURE_DISABLED);
    },
  );

  it("mounts plugin endpoints on the handler only", async () => {
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

    const res = await s3.handler(new Request(apiUrl("/audit/recent")));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ events: [] });
    expect(s3.api).not.toHaveProperty("recent");
  });
});
