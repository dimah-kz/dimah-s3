import { s3Error } from "@dimah-s3/core";
import { describe, expect, it, vi } from "vitest";
import { ConfigError } from "@/helpers/error-boundary";
import { testConfig } from "@/test/harness";
import type { Guard, GuardContext, GuardResult } from "@/types";
import { runOperation } from "./run-operation";

function setup(guard: Guard<GuardContext>, plugin?: string) {
  const error = vi.fn();
  const onError = vi.fn();
  const config = testConfig({
    logger: { error },
    onError,
    guard: [{ plugin, hook: guard }],
  });
  const run = vi.fn(async (context: GuardContext) => context);
  return { config, run, error, onError };
}

describe("guard results", () => {
  it.each([
    ["false", false],
    ["true", true],
    ["null", null],
    ["a string", "yes"],
    ["an array", [{ locals: {} }]],
    ["{ locals: null }", { locals: null }],
    ["{ locals } with extra keys", { locals: {}, allowed: true }],
  ])("treats %s as a 500 config error, never as allowed", async (_, value) => {
    const { config, run, error, onError } = setup(
      () => value as unknown as GuardResult,
      "auth",
    );

    await expect(runOperation(config, "upload", {}, run)).rejects.toMatchObject(
      { code: "INTERNAL_ERROR", statusCode: 500 },
    );
    expect(run).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(
      expect.stringMatching(
        /^Config error: The "auth" plugin guard for "upload" returned /,
      ),
      expect.any(ConfigError),
    );
    expect(onError).toHaveBeenCalledWith(
      expect.any(ConfigError),
      expect.objectContaining({ request: expect.any(Request) }),
    );
  });

  it("rejects a boolean guard at the type level", () => {
    // @ts-expect-error -- a boolean is not a GuardResult
    const guard: Guard<GuardContext> = () => true;
    expect(typeof guard).toBe("function");
  });

  it("allows when the guard returns nothing", async () => {
    const { config, run } = setup(() => {});
    await runOperation(config, "download", {}, run);
    expect(run).toHaveBeenCalledOnce();
  });

  it("passes a thrown APIError through without running the operation", async () => {
    const { config, run, error } = setup(() => {
      throw s3Error("UNAUTHORIZED");
    });
    await expect(runOperation(config, "delete", {}, run)).rejects.toMatchObject(
      { code: "UNAUTHORIZED", statusCode: 401 },
    );
    expect(run).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});

describe("locals", () => {
  it("merges { locals } into a null-prototype object", async () => {
    const config = testConfig({
      guard: [
        { plugin: "auth", hook: () => ({ locals: { userId: "u1" } }) },
        { hook: () => ({ locals: { role: "admin" } }) },
      ],
    });
    const context = await runOperation(
      config,
      "upload",
      {},
      async (ctx) => ctx,
    );

    expect(Object.getPrototypeOf(context.locals)).toBeNull();
    expect({ ...context.locals }).toEqual({ userId: "u1", role: "admin" });
  });

  it("seeds in-process calls with options.locals before guards run", async () => {
    const seen = vi.fn();
    const config = testConfig({
      guard: [
        {
          hook: (ctx) => {
            seen({ ...ctx.locals });
            return { locals: { role: "admin" } };
          },
        },
      ],
    });
    const seed = { userId: "u1", role: "viewer" };
    const context = await runOperation(
      config,
      "put",
      { locals: seed },
      async (ctx) => ctx,
    );

    expect(seen).toHaveBeenCalledWith({ userId: "u1", role: "viewer" });
    expect({ ...context.locals }).toEqual({ userId: "u1", role: "admin" });
    expect(seed).toEqual({ userId: "u1", role: "viewer" });
  });

  it("gives every call its own locals", async () => {
    const config = testConfig({
      guard: [{ hook: () => ({ locals: { userId: "u1" } }) }],
    });
    const first = await runOperation(config, "upload", {}, async (c) => c);
    const second = await runOperation(config, "upload", {}, async (c) => c);
    expect(first.locals).not.toBe(second.locals);
  });
});

describe("runOperation", () => {
  it("passes the operation and the given request to guards and run", async () => {
    const request = new Request("https://app.test/api/s3/presign/upload", {
      method: "POST",
    });
    const guard = vi.fn();
    const config = testConfig({ guard: [{ hook: guard }] });
    const context = await runOperation(
      config,
      "multipart.init",
      { request, headers: { cookie: "ignored" } },
      async (ctx) => ctx,
    );

    expect(context.request).toBe(request);
    expect(context.operation).toBe("multipart.init");
    expect(guard).toHaveBeenCalledWith(context);
  });

  it("synthesizes a request from basePath and headers", async () => {
    const context = await runOperation(
      testConfig({ basePath: "/files" }),
      "upload",
      { headers: { cookie: "session=1" } },
      async (ctx) => ctx,
    );
    expect(context.request.url).toBe("http://localhost/files");
    expect(context.request.headers.get("cookie")).toBe("session=1");
  });

  it("synthesizes a request from baseURL when it is set", async () => {
    const context = await runOperation(
      testConfig({ baseURL: "https://app.test/api/s3" }),
      "upload",
      {},
      async (ctx) => ctx,
    );
    expect(context.request.url).toBe("https://app.test/api/s3");
  });

  it("maps a plain Error from the operation to INTERNAL_ERROR", async () => {
    const onError = vi.fn();
    const failure = new Error("S3 exploded");
    const request = new Request("http://localhost/api/s3");
    await expect(
      runOperation(
        testConfig({ onError }),
        "confirm",
        { request },
        async () => {
          throw failure;
        },
      ),
    ).rejects.toMatchObject({ code: "INTERNAL_ERROR", statusCode: 500 });
    expect(onError).toHaveBeenCalledWith(
      failure,
      expect.objectContaining({ request }),
    );
  });
});
