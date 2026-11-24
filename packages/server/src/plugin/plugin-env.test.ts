import { s3Error } from "@dimah-s3/core";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { createS3Endpoint } from "@/api/create-s3-endpoint";
import { createS3Middleware } from "@/api/create-s3-middleware";
import { dimahS3 } from "@/dimah-s3";
import { route } from "@/route";
import {
  apiUrl,
  expectErrorCode,
  mockS3,
  testInstanceConfig,
  TEST_BUCKET,
} from "@/test/harness";
import type { DimahS3Config } from "@/types/config";
import type { GuardContext, RouteGuardContext } from "@/types/hook-contexts";
import type { DimahS3Locals } from "@/types/locals";
import { definePlugin } from "./define-plugin";
import type { PluginInitEnv } from "./types";

declare module "@/types/locals" {
  interface DimahS3RoutePluginOptions {
    /** Only these tests set it. */
    envtest?: false | { label: string };
  }
}

/** Creates an instance with a plugin that keeps its env. */
function envOf(overrides: Partial<DimahS3Config> = {}) {
  let env: PluginInitEnv<"envtest"> | undefined;
  const plugin = definePlugin({
    id: "envtest",
    init: (initEnv) => {
      env = initEnv;
    },
  });
  const s3 = dimahS3(
    testInstanceConfig({
      ...overrides,
      plugins: [plugin, ...(overrides.plugins ?? [])],
    }),
  );
  if (!env) throw new Error("init did not run");
  return { env, s3 };
}

describe("PluginInitEnv.routes", () => {
  it("resolves each route's client, bucket, namespace, features, and options", () => {
    const instanceClient = mockS3();
    const routeClient = mockS3();
    const { env } = envOf({
      client: instanceClient,
      routes: {
        avatars: route({
          upload: { fileTypes: ["image/*"], maxFileSize: 1024 },
          plugins: { envtest: { label: "Avatars" } },
        }),
        archive: route({
          client: routeClient,
          bucket: "archive",
          keyPrefix: false,
          upload: { multipart: true },
          download: { mode: "proxy" },
          delete: true,
          plugins: { envtest: false },
        }),
      },
    });

    expect(env.routes.avatars).toEqual({
      name: "avatars",
      client: instanceClient,
      bucket: TEST_BUCKET,
      keyPrefix: "avatars",
      options: { label: "Avatars" },
      upload: {
        enabled: true,
        fileTypes: ["image/*"],
        maxFileSize: 1024,
        multipart: false,
      },
      download: { enabled: false },
      delete: { enabled: false },
    });
    expect(env.routes.archive).toEqual({
      name: "archive",
      client: routeClient,
      bucket: "archive",
      keyPrefix: false,
      options: false,
      upload: { enabled: true, multipart: true },
      download: {
        enabled: true,
        mode: "proxy",
        disposition: "attachment",
        maxExpiresIn: 600,
      },
      delete: { enabled: true },
    });
  });

  it("is read-only", () => {
    const { env } = envOf();
    expect(Object.isFrozen(env.routes)).toBe(true);
    expect(Object.isFrozen(env.routes.uploads)).toBe(true);
    expect(Object.isFrozen(env.routes.uploads.upload)).toBe(true);
  });

  it("types options and routeOptions by the plugin's augmentation", () => {
    const { env } = envOf({
      routes: {
        uploads: route({
          upload: true,
          plugins: { envtest: { label: "Uploads" } },
        }),
      },
    });

    expectTypeOf(env.routes.uploads.options).toEqualTypeOf<
      { label: string } | false | undefined
    >();
    expectTypeOf(env.routeOptions("uploads")).toEqualTypeOf<
      { label: string } | false | undefined
    >();
    expect(env.routeOptions("uploads")).toEqual({ label: "Uploads" });
    expect(env.routeOptions("missing")).toBeUndefined();
  });
});

describe("PluginInitEnv.runOperation", () => {
  it("runs every instance guard as a plugin operation, then the callback", async () => {
    const seen: GuardContext[] = [];
    const pluginGuard = vi.fn((context: GuardContext) => {
      seen.push(context);
      return { locals: { fromPlugin: true } as Partial<DimahS3Locals> };
    });
    const userGuard = vi.fn((context: GuardContext) => {
      seen.push(context);
    });
    const { env } = envOf({
      guard: userGuard,
      plugins: [definePlugin({ id: "auth", hooks: { guard: pluginGuard } })],
    });

    const result = await env.runOperation(
      { action: "sync" },
      {
        headers: { "x-user": "u1" },
        locals: { seeded: 1 } as Partial<DimahS3Locals>,
      },
      async (context) => {
        expect(context.locals).toEqual({ seeded: 1, fromPlugin: true });
        return context.request.headers.get("x-user");
      },
    );

    expect(result).toBe("u1");
    expect(pluginGuard).toHaveBeenCalledTimes(1);
    expect(userGuard).toHaveBeenCalledTimes(1);
    expect(seen[0]).toMatchObject({
      operation: "plugin",
      plugin: { id: "envtest", action: "sync" },
    });
    expect(seen[0]).not.toHaveProperty("route");
  });

  it("runs the route guard when the call names a route", async () => {
    const routeGuard = vi.fn();
    const { env } = envOf({
      routes: { uploads: route({ upload: true, guard: routeGuard }) },
    });

    const route_ = await env.runOperation(
      { action: "record", route: "uploads" },
      undefined,
      async (context) => {
        expectTypeOf(context).toEqualTypeOf<RouteGuardContext>();
        return context.route;
      },
    );

    expect(route_).toBe("uploads");
    expect(routeGuard).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "plugin",
        plugin: { id: "envtest", action: "record" },
        route: "uploads",
      }),
    );
  });

  it("rejects a missing route with ROUTE_NOT_FOUND before the callback", async () => {
    const run = vi.fn();
    const { env } = envOf();

    await expect(
      env.runOperation({ action: "record", route: "missing" }, {}, run),
    ).rejects.toMatchObject({ code: "ROUTE_NOT_FOUND", statusCode: 404 });
    expect(run).not.toHaveBeenCalled();
  });

  it("stops at a guard that throws", async () => {
    const run = vi.fn();
    const { env } = envOf({
      guard: () => {
        throw s3Error("UNAUTHORIZED");
      },
    });

    await expect(
      env.runOperation({ action: "sync" }, {}, run),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(run).not.toHaveBeenCalled();
  });

  it("reports an unexpected failure and returns INTERNAL_ERROR", async () => {
    const onError = vi.fn();
    const error = vi.fn();
    const failure = new Error("database down");
    const { env } = envOf({ onError, logger: { error } });

    await expect(
      env.runOperation({ action: "sync" }, {}, async () => {
        throw failure;
      }),
    ).rejects.toMatchObject({ code: "INTERNAL_ERROR", statusCode: 500 });
    expect(onError).toHaveBeenCalledWith(
      failure,
      expect.objectContaining({ operation: "plugin" }),
    );
    expect(error).toHaveBeenCalled();
  });

  it("rejects a call without an action before any guard runs", async () => {
    const guard = vi.fn();
    const { env } = envOf({ guard });

    await expect(
      env.runOperation({ action: "" }, {}, async () => undefined),
    ).rejects.toThrow(/runOperation without an action/);
    expect(guard).not.toHaveBeenCalled();
  });
});

describe("plugin endpoint guards", () => {
  it("see the plugin id and endpoint name", async () => {
    const guard = vi.fn();
    const s3 = dimahS3(
      testInstanceConfig({
        guard,
        plugins: [
          definePlugin({
            id: "audit",
            endpoints: {
              listEvents: createS3Endpoint(
                "/audit/events",
                { method: "GET" },
                async () => ({ events: [] }),
              ),
            },
          }),
        ],
      }),
    );

    const res = await s3.handler(new Request(apiUrl("/audit/events")));

    expect(res.status).toBe(200);
    expect(guard).toHaveBeenCalledTimes(1);
    expect(guard.mock.calls[0][0]).toMatchObject({
      operation: "plugin",
      plugin: { id: "audit", action: "listEvents" },
    });
  });

  it("see it once when a middleware runs first", async () => {
    const guard = vi.fn((context: GuardContext) => {
      if (context.plugin?.action === "secret") throw s3Error("FORBIDDEN");
    });
    const middleware = createS3Middleware(async () => undefined);
    const s3 = dimahS3(
      testInstanceConfig({
        guard,
        plugins: [
          definePlugin({
            id: "audit",
            endpoints: {
              secret: createS3Endpoint(
                "/audit/secret",
                { method: "GET", use: [middleware] },
                async () => ({ ok: true }),
              ),
            },
          }),
        ],
      }),
    );

    const res = await s3.handler(new Request(apiUrl("/audit/secret")));

    await expectErrorCode(res, 403, { code: "FORBIDDEN" });
    expect(guard).toHaveBeenCalledTimes(1);
  });

  it("keep one endpoint usable by two instances", async () => {
    const listEvents = createS3Endpoint(
      "/audit/events",
      { method: "GET" },
      async () => ({ events: [] }),
    );
    const seen: unknown[] = [];
    const make = (id: string) =>
      dimahS3(
        testInstanceConfig({
          guard: ({ plugin }) => {
            seen.push(plugin);
          },
          plugins: [
            definePlugin({ id: "audit", endpoints: { [id]: listEvents } }),
          ],
        }),
      );

    await make("first").handler(new Request(apiUrl("/audit/events")));
    await make("second").handler(new Request(apiUrl("/audit/events")));

    expect(seen).toEqual([
      { id: "audit", action: "first" },
      { id: "audit", action: "second" },
    ]);
  });
});
