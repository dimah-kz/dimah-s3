import {
  S3_API_BASE_PATH,
  S3_API_ROUTES,
  S3_ERROR_CODES,
  s3Error,
} from "@dimah-s3/core";
import { createRouter, type Endpoint } from "better-call";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import * as z from "zod";
import { toAPIError } from "@/helpers/error-boundary";
import {
  apiUrl,
  expectErrorCode,
  jsonRequest,
  testConfig,
} from "@/test/harness";
import type { DimahS3Config } from "@/types/config";
import type { DimahS3Locals, Guard } from "@/types/locals";
import type { GuardContext } from "@/types/hook-contexts";
import type { ResolvedConfig } from "@/types/resolved";
import type { S3EndpointContext } from "./context";
import {
  createCoreEndpoint,
  createS3Endpoint,
  type S3EndpointOptions,
} from "./create-s3-endpoint";
import { createS3Middleware } from "./create-s3-middleware";
import { createRouterContext } from "./router-context";

type TestLocals = { userId?: string };

/** The config a test instance was created with. */
const userConfig: DimahS3Config = { routes: {} };

/** Mounts endpoints the way the dimahS3 router does. */
function mount(
  endpoints: Record<string, Endpoint>,
  config: ResolvedConfig = testConfig(),
) {
  const router = createRouter(endpoints, {
    basePath: S3_API_BASE_PATH,
    routerContext: createRouterContext(userConfig, config),
    openapi: { disabled: true },
    onError: (error, request) => {
      throw toAPIError(error, config, request);
    },
  });
  return router.handler;
}

function instanceGuards(
  ...guards: Guard<GuardContext>[]
): Partial<ResolvedConfig> {
  return { guard: guards.map((hook) => ({ hook })) };
}

const renameBody = z.object({ key: z.string(), name: z.string().min(1) });

describe("createS3Endpoint: methods", () => {
  it("reads a JSON body on PATCH", async () => {
    const handler = mount({
      rename: createS3Endpoint(
        "/files/rename",
        { method: "PATCH", body: renameBody },
        async (ctx) => ({ renamed: ctx.body }),
      ),
    });

    const res = await handler(
      jsonRequest(apiUrl("/files/rename"), {
        method: "PATCH",
        body: { key: "uploads/a.png", name: "b.png" },
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      renamed: { key: "uploads/a.png", name: "b.png" },
    });
  });

  it("returns VALIDATION_ERROR for a PATCH body that fails its schema", async () => {
    const run = vi.fn();
    const handler = mount({
      rename: createS3Endpoint(
        "/files/rename",
        { method: "PATCH", body: renameBody },
        async () => run(),
      ),
    });

    const res = await handler(
      jsonRequest(apiUrl("/files/rename"), {
        method: "PATCH",
        body: { key: "uploads/a.png", name: "" },
      }),
    );

    await expectErrorCode(res, 400, S3_ERROR_CODES.VALIDATION_ERROR);
    expect(run).not.toHaveBeenCalled();
  });

  it("reads the query on DELETE and never parses a body", async () => {
    const handler = mount({
      remove: createS3Endpoint(
        "/files/remove",
        { method: "DELETE", query: z.object({ key: z.string() }) },
        async (ctx) => ({ query: ctx.query, body: ctx.body ?? null }),
      ),
    });

    const res = await handler(
      jsonRequest(apiUrl("/files/remove?key=uploads%2Fa.png"), {
        method: "DELETE",
        body: { key: "uploads/other.png" },
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      query: { key: "uploads/a.png" },
      body: null,
    });
  });

  it("returns VALIDATION_ERROR for a DELETE query that fails its schema", async () => {
    const handler = mount({
      remove: createS3Endpoint(
        "/files/remove",
        { method: "DELETE", query: z.object({ key: z.string() }) },
        async () => ({}),
      ),
    });

    const res = await handler(
      new Request(apiUrl("/files/remove"), { method: "DELETE" }),
    );

    await expectErrorCode(res, 400, S3_ERROR_CODES.VALIDATION_ERROR);
  });

  it("reads the query on GET", async () => {
    const handler = mount({
      recent: createS3Endpoint(
        "/audit/recent",
        { method: "GET", query: z.object({ limit: z.coerce.number() }) },
        async (ctx) => ({ limit: ctx.query.limit }),
      ),
    });

    const res = await handler(new Request(apiUrl("/audit/recent?limit=5")));

    await expect(res.json()).resolves.toEqual({ limit: 5 });
  });

  it.each(["PUT", "HEAD", "*"])("rejects the %s method", (method) => {
    expect(() =>
      createS3Endpoint(
        "/files/x",
        { method } as unknown as S3EndpointOptions,
        async () => ({}),
      ),
    ).toThrow(/GET, POST, PATCH or DELETE/);
  });

  it("rejects a body schema on DELETE", () => {
    expect(() =>
      createS3Endpoint(
        "/files/x",
        { method: "DELETE", body: renameBody } as unknown as S3EndpointOptions,
        async () => ({}),
      ),
    ).toThrow(/reads the query/);
  });
});

describe("createS3Endpoint: media types", () => {
  const endpoints = () => ({
    create: createS3Endpoint(
      "/files",
      { method: "POST", body: renameBody },
      async () => ({ ok: true }),
    ),
    rename: createS3Endpoint(
      "/files",
      { method: "PATCH", body: renameBody },
      async () => ({ ok: true }),
    ),
  });

  it.each([
    {
      method: "POST",
      type: "application/x-www-form-urlencoded",
      body: "key=a&name=b",
    },
    { method: "POST", type: "multipart/form-data; boundary=x", body: "--x--" },
    { method: "PATCH", type: "text/plain", body: '{"key":"a","name":"b"}' },
  ])("returns 415 for a $type $method body", async ({ method, type, body }) => {
    const handler = mount(endpoints());
    const res = await handler(
      new Request(apiUrl("/files"), {
        method,
        headers: { "content-type": type },
        body,
      }),
    );

    await expectErrorCode(res, 415, S3_ERROR_CODES.UNSUPPORTED_MEDIA_TYPE);
  });

  it("returns 415 for a body without a content type", async () => {
    const handler = mount(endpoints());
    const res = await handler(
      new Request(apiUrl("/files"), {
        method: "POST",
        body: new Uint8Array([123, 125]),
      }),
    );

    await expectErrorCode(res, 415, S3_ERROR_CODES.UNSUPPORTED_MEDIA_TYPE);
  });

  it("accepts JSON with a charset", async () => {
    const handler = mount(endpoints());
    const res = await handler(
      new Request(apiUrl("/files"), {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ key: "a", name: "b" }),
      }),
    );

    expect(res.status).toBe(200);
  });

  it("keeps the request body readable for guards", async () => {
    const seen = vi.fn();
    const handler = mount(
      endpoints(),
      testConfig(
        instanceGuards(async ({ request }) => {
          seen(await request.json());
        }),
      ),
    );

    await handler(
      jsonRequest(apiUrl("/files"), { body: { key: "a", name: "b" } }),
    );

    expect(seen).toHaveBeenCalledWith({ key: "a", name: "b" });
  });
});

describe("createS3Endpoint: guards and locals", () => {
  it("runs the instance guards as a plugin operation and passes their locals", async () => {
    const guard = vi.fn(
      ({ request }: GuardContext): { locals: TestLocals } => ({
        locals: { userId: request.headers.get("x-user") ?? undefined },
      }),
    );
    const handler = mount(
      {
        me: createS3Endpoint("/me", { method: "GET" }, async (ctx) => ({
          locals: { ...ctx.context.locals },
          url: ctx.context.request.url,
        })),
      },
      testConfig(instanceGuards(guard)),
    );

    const res = await handler(
      new Request(apiUrl("/me"), { headers: { "x-user": "u1" } }),
    );

    await expect(res.json()).resolves.toEqual({
      locals: { userId: "u1" },
      url: apiUrl("/me"),
    });
    expect(guard).toHaveBeenCalledOnce();
    expect(guard.mock.calls[0][0].operation).toBe("plugin");
  });

  it("returns the guard's error without running the handler", async () => {
    const run = vi.fn();
    const handler = mount(
      { me: createS3Endpoint("/me", { method: "GET" }, async () => run()) },
      testConfig(
        instanceGuards(() => {
          throw s3Error("FORBIDDEN");
        }),
      ),
    );

    const res = await handler(new Request(apiUrl("/me")));

    await expectErrorCode(res, 403, S3_ERROR_CODES.FORBIDDEN);
    expect(run).not.toHaveBeenCalled();
  });

  it("returns 500 when a guard returns a boolean", async () => {
    const error = vi.fn();
    const handler = mount(
      { me: createS3Endpoint("/me", { method: "GET" }, async () => ({})) },
      testConfig({
        ...instanceGuards((() => true) as unknown as Guard<GuardContext>),
        logger: { error },
      }),
    );

    const res = await handler(new Request(apiUrl("/me")));

    await expectErrorCode(res, 500, S3_ERROR_CODES.INTERNAL_ERROR);
    expect(error).toHaveBeenCalledWith(
      expect.stringMatching(/^Config error:/),
      expect.anything(),
    );
  });

  it("gives concurrent requests their own request and locals", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const handler = mount(
      {
        me: createS3Endpoint("/me", { method: "GET" }, async (ctx) => {
          const before = (ctx.context.locals as TestLocals).userId;
          if (before === "slow") await gate;
          return {
            userId: (ctx.context.locals as TestLocals).userId,
            user: ctx.context.request.headers.get("x-user"),
          };
        }),
      },
      testConfig(
        instanceGuards(({ request }) => ({
          locals: { userId: request.headers.get("x-user") ?? undefined },
        })),
      ),
    );

    const slow = handler(
      new Request(apiUrl("/me"), { headers: { "x-user": "slow" } }),
    );
    const fast = await handler(
      new Request(apiUrl("/me"), { headers: { "x-user": "fast" } }),
    );
    release();

    await expect(fast.json()).resolves.toEqual({
      userId: "fast",
      user: "fast",
    });
    await expect((await slow).json()).resolves.toEqual({
      userId: "slow",
      user: "slow",
    });
  });

  it("leaves the guards of core paths to their operation", async () => {
    const guard = vi.fn();
    const handler = mount(
      {
        catalog: createCoreEndpoint(
          S3_API_ROUTES.catalog,
          { method: "GET" },
          async (ctx) => ({ url: ctx.context.request.url }),
        ),
      },
      testConfig(instanceGuards(guard)),
    );

    const res = await handler(new Request(apiUrl(S3_API_ROUTES.catalog)));

    await expect(res.json()).resolves.toEqual({
      url: apiUrl(S3_API_ROUTES.catalog),
    });
    expect(guard).not.toHaveBeenCalled();
  });

  it("gives createS3Middleware the endpoint context and runs the guards once", async () => {
    const guard = vi.fn(() => ({ locals: { userId: "u1" } }));
    const requireUser = createS3Middleware(async (ctx) => {
      if (!(ctx.context.locals as TestLocals).userId) {
        throw s3Error("UNAUTHORIZED");
      }
      return { userId: (ctx.context.locals as TestLocals).userId };
    });
    const handler = mount(
      {
        me: createS3Endpoint(
          "/me",
          { method: "GET", use: [requireUser] },
          async (ctx) => ({ userId: ctx.context.userId }),
        ),
      },
      testConfig(instanceGuards(guard)),
    );

    const res = await handler(new Request(apiUrl("/me")));

    await expect(res.json()).resolves.toEqual({ userId: "u1" });
    expect(guard).toHaveBeenCalledOnce();
  });

  it("gives the handler the user config, not the resolved one", async () => {
    const seen = vi.fn();
    const handler = mount({
      me: createS3Endpoint("/me", { method: "GET" }, async (ctx) => {
        seen(ctx.context.config);
        return {};
      }),
    });

    await handler(new Request(apiUrl("/me")));

    expect(seen).toHaveBeenCalledOnce();
    expect(seen.mock.calls[0][0]).toBe(userConfig);
  });

  it("needs the router context", async () => {
    const endpoint = createS3Endpoint(
      "/me",
      { method: "GET" },
      async () => ({}),
    );

    await expect(endpoint()).rejects.toThrow(/dimahS3 router context/);
  });
});

describe("createS3Endpoint: error boundary", () => {
  it("passes an APIError through", async () => {
    const handler = mount({
      me: createS3Endpoint("/me", { method: "GET" }, async () => {
        throw s3Error("CONFLICT");
      }),
    });

    const res = await handler(new Request(apiUrl("/me")));

    await expectErrorCode(res, 409, S3_ERROR_CODES.CONFLICT);
  });

  it("keeps the headers an APIError carries", async () => {
    const handler = mount({
      me: createS3Endpoint("/me", { method: "GET" }, async (ctx) => {
        ctx.setHeader("x-endpoint", "1");
        const error = s3Error("CONFLICT");
        error.headers = { "retry-after": "5" };
        throw error;
      }),
    });

    const res = await handler(new Request(apiUrl("/me")));

    await expectErrorCode(res, 409, S3_ERROR_CODES.CONFLICT);
    expect(res.headers.get("retry-after")).toBe("5");
    expect(res.headers.get("x-endpoint")).toBe("1");
  });

  it("logs a plain Error, passes it to onError, and returns INTERNAL_ERROR", async () => {
    const failure = new Error("database down");
    const error = vi.fn();
    const onError = vi.fn();
    const handler = mount(
      {
        me: createS3Endpoint("/me", { method: "GET" }, async () => {
          throw failure;
        }),
      },
      testConfig({ logger: { error }, onError }),
    );
    const request = new Request(apiUrl("/me"));

    const res = await handler(request);

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      code: "INTERNAL_ERROR",
      message: "Internal server error",
    });
    expect(error).toHaveBeenCalledWith("database down", failure);
    expect(onError).toHaveBeenCalledWith(failure, {
      request,
      operation: "plugin",
    });
  });
});

describe("createS3Endpoint: types", () => {
  it("types the context, body and query", () => {
    const rename = createS3Endpoint(
      "/files/rename",
      { method: "PATCH", body: renameBody },
      async (ctx) => {
        expectTypeOf(ctx.body).toEqualTypeOf<{ key: string; name: string }>();
        expectTypeOf(ctx.context.locals).toEqualTypeOf<DimahS3Locals>();
        expectTypeOf(ctx.context.request).toEqualTypeOf<Request>();
        expectTypeOf(ctx.context.config).toEqualTypeOf<
          Readonly<DimahS3Config>
        >();
        expectTypeOf(ctx.context).toExtend<S3EndpointContext>();
        return {};
      },
    );
    const remove = createS3Endpoint(
      "/files/remove",
      { method: "DELETE", query: z.object({ key: z.string() }) },
      async (ctx) => {
        expectTypeOf(ctx.query).toEqualTypeOf<{ key: string }>();
        return {};
      },
    );

    expect([rename.path, remove.path]).toEqual([
      "/files/rename",
      "/files/remove",
    ]);
  });

  it("rejects methods and bodies the endpoint does not support", () => {
    expect(() =>
      // @ts-expect-error -- PUT is not a dimah-s3 endpoint method
      createS3Endpoint("/x", { method: "PUT" }, async () => ({})),
    ).toThrow();
    expect(() =>
      createS3Endpoint(
        "/x",
        // @ts-expect-error -- DELETE reads the query, not a body
        { method: "DELETE", body: renameBody },
        async () => ({}),
      ),
    ).toThrow();
  });
});
