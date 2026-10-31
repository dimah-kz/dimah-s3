import { afterEach, describe, expect, it, vi } from "vitest";
import {
  reportCallbackError,
  runAfterCallback,
  runBeforeCallback,
  runStartCallback,
} from "./callbacks";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runBeforeCallback", () => {
  it("allows the call without a callback or when it does not return false", async () => {
    await expect(runBeforeCallback("beforeDelete", undefined)).resolves.toEqual(
      { status: "allowed" },
    );
    const callback = vi.fn(async (keys: readonly string[]) => keys.length > 0);
    await expect(
      runBeforeCallback("beforeDelete", callback, ["a"]),
    ).resolves.toEqual({ status: "allowed" });
    expect(callback).toHaveBeenCalledWith(["a"]);
  });

  it("blocks the call when the callback returns false", async () => {
    await expect(
      runBeforeCallback("beforeDelete", () => false),
    ).resolves.toEqual({ status: "blocked" });
  });

  it("turns a throw or rejection into HOOK_FAILED", async () => {
    const cause = new Error("nope");
    const sync = await runBeforeCallback("beforeDownload", () => {
      throw cause;
    });
    const rejected = await runBeforeCallback("beforeDownload", () =>
      Promise.reject(cause),
    );

    for (const result of [sync, rejected]) {
      expect(result.status).toBe("error");
      if (result.status !== "error") continue;
      expect(result.error).toMatchObject({
        code: "HOOK_FAILED",
        params: { hook: "beforeDownload" },
        message: "The beforeDownload callback failed",
      });
      expect(result.error.cause).toBe(cause);
    }
  });
});

describe("runStartCallback", () => {
  it("returns null when the callback runs", () => {
    const callback = vi.fn();
    expect(runStartCallback("onDeleteStart", callback, ["a"])).toBeNull();
    expect(callback).toHaveBeenCalledWith(["a"]);
    expect(runStartCallback("onDeleteStart", undefined)).toBeNull();
  });

  it("returns HOOK_FAILED when the callback throws", () => {
    const cause = new Error("nope");
    const error = runStartCallback("onDeleteStart", () => {
      throw cause;
    });
    expect(error).toMatchObject({
      code: "HOOK_FAILED",
      params: { hook: "onDeleteStart" },
    });
    expect(error?.cause).toBe(cause);
  });
});

describe("runAfterCallback", () => {
  it("awaits the callback", async () => {
    let finished = false;
    await runAfterCallback(async (value: number) => {
      await Promise.resolve();
      finished = value === 1;
    }, 1);
    expect(finished).toBe(true);
  });

  it("reports a throw or rejection instead of rethrowing", async () => {
    const report = vi.fn();
    vi.stubGlobal("reportError", report);
    const cause = new Error("nope");

    await expect(
      runAfterCallback(() => {
        throw cause;
      }),
    ).resolves.toBeUndefined();
    await expect(
      runAfterCallback(() => Promise.reject(cause)),
    ).resolves.toBeUndefined();

    expect(report).toHaveBeenCalledTimes(2);
    expect(report).toHaveBeenCalledWith(cause);
  });
});

describe("reportCallbackError", () => {
  it("falls back to console.error without a global reportError", () => {
    vi.stubGlobal("reportError", undefined);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("nope");

    reportCallbackError(error);

    expect(log).toHaveBeenCalledWith(error);
  });
});
