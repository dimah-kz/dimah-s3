import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  APIError,
  s3Error,
  type DeleteManyResponse,
  type DeleteResponse,
} from "@dimah-s3/core";
import { useDelete } from "./use-delete";
import { fakeS3Api } from "@/test/api";
import { renderHook, type RenderedHook } from "@/test/render-hook";
import type {
  DeleteOutcome,
  DeleteResult,
  UseDeleteOptions,
  UseDeleteReturn,
} from "@/types/delete";

const mounted: RenderedHook<UseDeleteReturn>[] = [];

afterEach(() => {
  for (const hook of mounted.splice(0)) hook.unmount();
});

function setup(options: Partial<UseDeleteOptions> = {}) {
  const api = options.api ?? fakeS3Api();
  const hook = renderHook(() =>
    useDelete({ route: "uploads", ...options, api }),
  );
  mounted.push(hook);
  return { api, hook };
}

/** A promise with its resolve and reject exposed. */
function deferred<T>() {
  return Promise.withResolvers<T>();
}

function keysFrom(count: number) {
  return Array.from({ length: count }, (_, index) => `k${index}.png`);
}

describe("useDelete remove", () => {
  it("deletes a key and keeps its fileName on the operation", async () => {
    const onSuccess = vi.fn();
    const onSettled = vi.fn();
    const { api, hook } = setup({ onSuccess, onSettled });

    let outcome: DeleteOutcome | undefined;
    await act(async () => {
      outcome = await hook.current.remove("a.png", { fileName: "A.png" });
    });

    const data = { key: "a.png", bucket: "bucket" };
    expect(api.delete).toHaveBeenCalledWith({ route: "uploads", key: "a.png" });
    expect(outcome).toEqual({ status: "success", key: "a.png", data });
    expect(hook.current.operations).toEqual([
      {
        id: expect.any(String),
        key: "a.png",
        batchId: null,
        fileName: "A.png",
        phase: "success",
        error: null,
      },
    ]);
    expect(hook.current.get("a.png")?.phase).toBe("success");
    expect(onSuccess).toHaveBeenCalledExactlyOnceWith(data, "a.png");
    expect(onSettled).toHaveBeenCalledExactlyOnceWith({
      deleted: ["a.png"],
      failed: [],
      blocked: [],
    });
  });

  it("tracks the key as pending while the request runs", async () => {
    const api = fakeS3Api();
    const request = deferred<DeleteResponse>();
    vi.mocked(api.delete).mockReturnValueOnce(request.promise);
    const onDeleteStart = vi.fn();
    const { hook } = setup({ api, onDeleteStart });

    let pending!: Promise<DeleteOutcome>;
    await act(async () => {
      pending = hook.current.remove("a.png");
    });
    expect(onDeleteStart).toHaveBeenCalledExactlyOnceWith(["a.png"]);
    expect(hook.current.pendingKeys).toEqual(["a.png"]);
    expect(hook.current.isPending).toBe(true);
    expect(hook.current.get("a.png")).toMatchObject({
      phase: "deleting",
      fileName: null,
    });

    await act(async () => {
      request.resolve({ key: "a.png", bucket: "bucket" });
      await pending;
    });
    expect(hook.current.pendingKeys).toEqual([]);
    expect(hook.current.isPending).toBe(false);
  });

  it("returns an error outcome with an APIError", async () => {
    const api = fakeS3Api();
    const failure = s3Error("FORBIDDEN");
    vi.mocked(api.delete).mockRejectedValueOnce(failure);
    const onError = vi.fn();
    const onSettled = vi.fn();
    const { hook } = setup({ api, onError, onSettled });

    let outcome: DeleteOutcome | undefined;
    await act(async () => {
      outcome = await hook.current.remove("a.png");
    });

    expect(outcome).toEqual({ status: "error", key: "a.png", error: failure });
    expect(hook.current.get("a.png")).toMatchObject({
      phase: "error",
      error: failure,
    });
    expect(onError).toHaveBeenCalledExactlyOnceWith(failure, "a.png");
    expect(onSettled).toHaveBeenCalledExactlyOnceWith({
      deleted: [],
      failed: [{ key: "a.png", error: failure }],
      blocked: [],
    });
  });

  it("lets onError remove the same key again", async () => {
    const api = fakeS3Api();
    vi.mocked(api.delete).mockRejectedValueOnce(s3Error("NETWORK_ERROR"));
    let retry: Promise<DeleteOutcome> | undefined;
    const { hook } = setup({
      api,
      onError: (_error, key) => {
        retry = hook.current.remove(key);
      },
    });

    let outcome: DeleteOutcome | undefined;
    let retried: DeleteOutcome | undefined;
    await act(async () => {
      outcome = await hook.current.remove("a.png");
      retried = await retry;
    });

    expect(outcome?.status).toBe("error");
    expect(retried).toEqual({
      status: "success",
      key: "a.png",
      data: { key: "a.png", bucket: "bucket" },
    });
    expect(api.delete).toHaveBeenCalledTimes(2);
    expect(hook.current.pendingKeys).toEqual([]);
    expect(hook.current.get("a.png")?.phase).toBe("success");
  });

  it("normalizes a non-API failure to UNKNOWN_ERROR", async () => {
    const api = fakeS3Api();
    vi.mocked(api.delete).mockRejectedValueOnce(new TypeError("boom"));
    const { hook } = setup({ api });

    let outcome: DeleteOutcome | undefined;
    await act(async () => {
      outcome = await hook.current.remove("a.png");
    });

    expect(outcome?.status).toBe("error");
    const error = outcome?.status === "error" ? outcome.error : null;
    expect(error).toBeInstanceOf(APIError);
    expect(error?.code).toBe("UNKNOWN_ERROR");
  });

  it("blocks without an operation when beforeDelete returns false", async () => {
    const beforeDelete = vi.fn(async () => false);
    const onDeleteStart = vi.fn();
    const onSettled = vi.fn();
    const { api, hook } = setup({ beforeDelete, onDeleteStart, onSettled });

    let outcome: DeleteOutcome | undefined;
    await act(async () => {
      outcome = await hook.current.remove("a.png");
    });

    expect(beforeDelete).toHaveBeenCalledExactlyOnceWith(["a.png"]);
    expect(outcome).toEqual({ status: "blocked", key: "a.png" });
    expect(api.delete).not.toHaveBeenCalled();
    expect(onDeleteStart).not.toHaveBeenCalled();
    expect(hook.current.operations).toEqual([]);
    expect(onSettled).toHaveBeenCalledExactlyOnceWith({
      deleted: [],
      failed: [],
      blocked: ["a.png"],
    });
  });

  it.each([
    [
      "beforeDelete",
      {
        beforeDelete: () => {
          throw new Error("nope");
        },
      },
    ],
    [
      "onDeleteStart",
      {
        onDeleteStart: () => {
          throw new Error("nope");
        },
      },
    ],
  ] as const)(
    "fails with HOOK_FAILED when %s throws",
    async (hookName, callbacks) => {
      const onError = vi.fn();
      const { api, hook } = setup({ ...callbacks, onError });

      let outcome: DeleteOutcome | undefined;
      await act(async () => {
        outcome = await hook.current.remove("a.png");
      });

      expect(api.delete).not.toHaveBeenCalled();
      const error = outcome?.status === "error" ? outcome.error : null;
      expect(error?.code).toBe("HOOK_FAILED");
      expect(error?.params).toEqual({ hook: hookName });
      expect(hook.current.get("a.png")).toMatchObject({
        phase: "error",
        error,
      });
      expect(onError).toHaveBeenCalledExactlyOnceWith(error, "a.png");
    },
  );

  it("joins a call for a key that is already running", async () => {
    const api = fakeS3Api();
    const request = deferred<DeleteResponse>();
    vi.mocked(api.delete).mockReturnValueOnce(request.promise);
    const onSuccess = vi.fn();
    const onSettled = vi.fn();
    const { hook } = setup({ api, onSuccess, onSettled });

    let first!: Promise<DeleteOutcome>;
    let second!: Promise<DeleteOutcome>;
    await act(async () => {
      first = hook.current.remove("a.png");
      second = hook.current.remove("a.png", { fileName: "other.png" });
    });

    await act(async () => {
      request.resolve({ key: "a.png", bucket: "bucket" });
      await Promise.all([first, second]);
    });

    expect(await second).toBe(await first);
    expect(api.delete).toHaveBeenCalledOnce();
    expect(onSuccess).toHaveBeenCalledOnce();
    expect(onSettled).toHaveBeenCalledOnce();
    expect(hook.current.operations).toHaveLength(1);
  });

  it("starts a new operation once the previous call settled", async () => {
    const { api, hook } = setup();

    await act(async () => {
      await hook.current.remove("a.png");
      await hook.current.remove("a.png");
    });

    expect(api.delete).toHaveBeenCalledTimes(2);
    const [first, second] = hook.current.operations;
    expect(hook.current.get("a.png")).toBe(second);
    expect(Number(second.id)).toBeGreaterThan(Number(first.id));
  });

  it("rejects with a setup error without an S3Api", async () => {
    const hook = renderHook(() => useDelete({ route: "uploads" }));
    mounted.push(hook);

    await expect(hook.current.remove("a.png")).rejects.toThrow(
      /No S3Api found/,
    );
  });
});

describe("useDelete removeMany", () => {
  it("shares one batchId per call and keeps each fileName", async () => {
    const { api, hook } = setup();

    await act(async () => {
      await hook.current.removeMany([
        { key: "a.png", fileName: "A.png" },
        "b.png",
      ]);
      await hook.current.removeMany(["c.png"]);
    });

    expect(api.deleteMany).toHaveBeenNthCalledWith(1, {
      route: "uploads",
      keys: ["a.png", "b.png"],
    });
    const [a, b, c] = hook.current.operations;
    expect(a).toMatchObject({ key: "a.png", fileName: "A.png" });
    expect(b).toMatchObject({ key: "b.png", fileName: null });
    expect(a.batchId).not.toBeNull();
    expect(b.batchId).toBe(a.batchId);
    expect(c.batchId).not.toBeNull();
    expect(c.batchId).not.toBe(a.batchId);
  });

  it("chunks 250 keys into 3 deleteMany calls with one onSettled", async () => {
    const onSuccess = vi.fn();
    const onSettled = vi.fn();
    const beforeDelete = vi.fn(() => true);
    const { api, hook } = setup({ beforeDelete, onSuccess, onSettled });
    const keys = keysFrom(250);

    let result: DeleteResult | undefined;
    await act(async () => {
      result = await hook.current.removeMany(keys);
    });

    const sent = vi.mocked(api.deleteMany).mock.calls.map(([p]) => p.keys);
    expect(sent.map((chunk) => chunk.length)).toEqual([100, 100, 50]);
    expect(sent.flat()).toEqual(keys);
    expect(beforeDelete).toHaveBeenCalledOnce();
    expect(result).toEqual({ deleted: keys, failed: [], blocked: [] });
    expect(onSuccess).toHaveBeenCalledTimes(250);
    expect(onSuccess).toHaveBeenCalledWith({ key: "k0.png" }, "k0.png");
    expect(onSettled).toHaveBeenCalledExactlyOnceWith(result);
    expect(new Set(hook.current.operations.map((op) => op.batchId)).size).toBe(
      1,
    );
  });

  it("rebuilds failed entries with APIError.fromShape", async () => {
    const api = fakeS3Api();
    vi.mocked(api.deleteMany).mockResolvedValueOnce({
      deleted: ["a.png"],
      failed: [
        {
          key: "b.png",
          error: { code: "FORBIDDEN", message: "Forbidden" },
        },
      ],
    });
    const onError = vi.fn();
    const { hook } = setup({ api, onError });

    let result: DeleteResult | undefined;
    await act(async () => {
      result = await hook.current.removeMany(["a.png", "b.png"]);
    });

    expect(result?.deleted).toEqual(["a.png"]);
    const [failure] = result?.failed ?? [];
    expect(failure.key).toBe("b.png");
    expect(failure.error).toBeInstanceOf(APIError);
    expect(failure.error).toMatchObject({
      code: "FORBIDDEN",
      message: "Forbidden",
      statusCode: 403,
    });
    expect(hook.current.get("b.png")).toMatchObject({
      phase: "error",
      error: failure.error,
    });
    expect(onError).toHaveBeenCalledExactlyOnceWith(failure.error, "b.png");
  });

  it("reports every error before any success", async () => {
    const api = fakeS3Api();
    vi.mocked(api.deleteMany).mockResolvedValueOnce({
      deleted: ["a.png"],
      failed: [
        { key: "b.png", error: { code: "FORBIDDEN", message: "Forbidden" } },
      ],
    });
    const calls: string[] = [];
    const { hook } = setup({
      api,
      onSuccess: (_, key) => void calls.push(`success:${key}`),
      onError: (_, key) => void calls.push(`error:${key}`),
      onSettled: () => void calls.push("settled"),
    });

    await act(async () => {
      await hook.current.removeMany(["a.png", "b.png"]);
    });

    expect(calls).toEqual(["error:b.png", "success:a.png", "settled"]);
  });

  it("lets onError remove the failed keys again", async () => {
    const api = fakeS3Api();
    vi.mocked(api.deleteMany).mockRejectedValueOnce(s3Error("NETWORK_ERROR"));
    const retries: Promise<DeleteResult>[] = [];
    const { hook } = setup({
      api,
      onError: (_error, key) => {
        retries.push(hook.current.removeMany([key]));
      },
    });

    let result: DeleteResult | undefined;
    let retried: DeleteResult[] | undefined;
    await act(async () => {
      result = await hook.current.removeMany(["a.png", "b.png"]);
      retried = await Promise.all(retries);
    });

    expect(result?.failed.map(({ key }) => key)).toEqual(["a.png", "b.png"]);
    expect(api.deleteMany).toHaveBeenCalledTimes(3);
    expect(retried).toEqual([
      { deleted: ["a.png"], failed: [], blocked: [] },
      { deleted: ["b.png"], failed: [], blocked: [] },
    ]);
    expect(hook.current.pendingKeys).toEqual([]);
  });

  it("fails only the keys of a chunk whose request fails", async () => {
    const api = fakeS3Api();
    const failure = s3Error("NETWORK_ERROR");
    vi.mocked(api.deleteMany).mockImplementation(async ({ keys }) => {
      if (keys[0] === "k0.png") throw failure;
      return { deleted: [...keys], failed: [] };
    });
    const { hook } = setup({ api });
    const keys = keysFrom(150);

    let result: DeleteResult | undefined;
    await act(async () => {
      result = await hook.current.removeMany(keys);
    });

    expect(api.deleteMany).toHaveBeenCalledTimes(2);
    expect(result?.failed).toEqual(
      keys.slice(0, 100).map((key) => ({ key, error: failure })),
    );
    expect(result?.deleted).toEqual(keys.slice(100));
  });

  it("fails a key the server left out of its response", async () => {
    const api = fakeS3Api();
    vi.mocked(api.deleteMany).mockResolvedValueOnce({
      deleted: ["a.png"],
      failed: [],
    });
    const { hook } = setup({ api });

    let result: DeleteResult | undefined;
    await act(async () => {
      result = await hook.current.removeMany(["a.png", "b.png"]);
    });

    expect(result?.deleted).toEqual(["a.png"]);
    expect(result?.failed).toHaveLength(1);
    expect(result?.failed[0].key).toBe("b.png");
    expect(result?.failed[0].error.code).toBe("UNKNOWN_ERROR");
    expect(hook.current.pendingKeys).toEqual([]);
  });

  it.each([
    ["a response without failed", { deleted: ["a.png"] }],
    [
      "a failed entry without an error",
      { deleted: ["a.png"], failed: [{ key: "b.png", error: undefined }] },
    ],
    ["a string body", "Internal Server Error"],
  ])(
    "fails the unreported keys of %s with an APIError",
    async (_, response) => {
      const api = fakeS3Api();
      vi.mocked(api.deleteMany).mockResolvedValueOnce(
        response as unknown as DeleteManyResponse,
      );
      const onError = vi.fn();
      const onSettled = vi.fn();
      const { hook } = setup({ api, onError, onSettled });

      let result: DeleteResult | undefined;
      await act(async () => {
        result = await hook.current.removeMany(["a.png", "b.png"]);
      });

      const deleted = typeof response === "string" ? [] : ["a.png"];
      expect(result?.deleted).toEqual(deleted);
      expect(result?.failed.map(({ key }) => key)).toEqual(
        ["a.png", "b.png"].filter((key) => !deleted.includes(key)),
      );
      for (const { error } of result?.failed ?? []) {
        expect(error).toBeInstanceOf(APIError);
        expect(error.code).toBe("UNKNOWN_ERROR");
      }
      expect(onError).toHaveBeenCalledTimes(result?.failed.length ?? 0);
      expect(onSettled).toHaveBeenCalledExactlyOnceWith(result);
      expect(hook.current.pendingKeys).toEqual([]);
      expect(
        hook.current.operations.every((op) => op.phase !== "deleting"),
      ).toBe(true);
    },
  );

  it("maps the server's normalized keys back to the keys it sent", async () => {
    const api = fakeS3Api();
    vi.mocked(api.deleteMany).mockResolvedValueOnce({
      deleted: ["docs/a.pdf"],
      failed: [
        {
          key: "docs/b.pdf",
          error: { code: "FORBIDDEN", message: "Forbidden" },
        },
      ],
    });
    const onSuccess = vi.fn();
    const { hook } = setup({ api, onSuccess });

    let result: DeleteResult | undefined;
    await act(async () => {
      result = await hook.current.removeMany([
        "/docs/a.pdf",
        " docs/a.pdf/ ",
        "docs/b.pdf/",
      ]);
    });

    expect(result?.deleted).toEqual(["/docs/a.pdf", " docs/a.pdf/ "]);
    expect(result?.failed).toHaveLength(1);
    expect(result?.failed[0].key).toBe("docs/b.pdf/");
    expect(result?.failed[0].error.code).toBe("FORBIDDEN");
    expect(onSuccess).toHaveBeenCalledWith(
      { key: "/docs/a.pdf" },
      "/docs/a.pdf",
    );
    expect(hook.current.get("/docs/a.pdf")?.phase).toBe("success");
  });

  it("joins an in-flight key instead of sending it again", async () => {
    const api = fakeS3Api();
    const request = deferred<DeleteResponse>();
    vi.mocked(api.delete).mockReturnValueOnce(request.promise);
    const onSuccess = vi.fn();
    const beforeDelete = vi.fn(() => true);
    const { hook } = setup({ api, beforeDelete, onSuccess });

    let single!: Promise<DeleteOutcome>;
    let many!: Promise<DeleteResult>;
    await act(async () => {
      single = hook.current.remove("a.png");
    });
    await act(async () => {
      many = hook.current.removeMany(["a.png", "b.png"]);
    });

    expect(api.deleteMany).toHaveBeenCalledExactlyOnceWith({
      route: "uploads",
      keys: ["b.png"],
    });
    expect(beforeDelete).toHaveBeenLastCalledWith(["b.png"]);

    let result: DeleteResult | undefined;
    await act(async () => {
      request.resolve({ key: "a.png", bucket: "bucket" });
      result = await many;
      await single;
    });

    expect(result).toEqual({
      deleted: ["a.png", "b.png"],
      failed: [],
      blocked: [],
    });
    expect(onSuccess).toHaveBeenCalledTimes(2);
    expect(hook.current.operations.map((op) => op.key)).toEqual([
      "a.png",
      "b.png",
    ]);
  });

  it("lets remove join a key that removeMany is deleting", async () => {
    const api = fakeS3Api();
    const request = deferred<DeleteManyResponse>();
    vi.mocked(api.deleteMany).mockReturnValueOnce(request.promise);
    const { hook } = setup({ api });

    let many!: Promise<DeleteResult>;
    let single!: Promise<DeleteOutcome>;
    await act(async () => {
      many = hook.current.removeMany(["a.png", "b.png"]);
      single = hook.current.remove("b.png");
    });

    await act(async () => {
      request.resolve({ deleted: ["a.png", "b.png"], failed: [] });
      await many;
    });

    await expect(single).resolves.toEqual({
      status: "success",
      key: "b.png",
      data: { key: "b.png" },
    });
    expect(api.delete).not.toHaveBeenCalled();
  });

  it("sends a repeated key once", async () => {
    const { api, hook } = setup();

    let result: DeleteResult | undefined;
    await act(async () => {
      result = await hook.current.removeMany([
        "a.png",
        { key: "a.png", fileName: "A.png" },
      ]);
    });

    expect(api.deleteMany).toHaveBeenCalledExactlyOnceWith({
      route: "uploads",
      keys: ["a.png"],
    });
    expect(result?.deleted).toEqual(["a.png"]);
    expect(hook.current.operations).toHaveLength(1);
  });

  it("blocks every key when beforeDelete returns false", async () => {
    const { api, hook } = setup({ beforeDelete: () => false });

    let result: DeleteResult | undefined;
    await act(async () => {
      result = await hook.current.removeMany(["a.png", "b.png"]);
    });

    expect(api.deleteMany).not.toHaveBeenCalled();
    expect(result).toEqual({
      deleted: [],
      failed: [],
      blocked: ["a.png", "b.png"],
    });
    expect(hook.current.operations).toEqual([]);
  });

  it("settles an empty call without a request", async () => {
    const beforeDelete = vi.fn(() => true);
    const onSettled = vi.fn();
    const { api, hook } = setup({ beforeDelete, onSettled });

    let result: DeleteResult | undefined;
    await act(async () => {
      result = await hook.current.removeMany([]);
    });

    expect(result).toEqual({ deleted: [], failed: [], blocked: [] });
    expect(api.deleteMany).not.toHaveBeenCalled();
    expect(beforeDelete).not.toHaveBeenCalled();
    expect(onSettled).toHaveBeenCalledExactlyOnceWith(result);
  });
});

describe("useDelete reset", () => {
  it("clears settled operations, keeps running ones, and stays stable", async () => {
    const api = fakeS3Api();
    const request = deferred<DeleteResponse>();
    vi.mocked(api.delete).mockImplementation(async ({ key }) =>
      key === "b.png" ? request.promise : { key, bucket: "bucket" },
    );
    const { hook } = setup({ api });
    const { reset } = hook.current;

    let running!: Promise<DeleteOutcome>;
    await act(async () => {
      await hook.current.remove("a.png");
      running = hook.current.remove("b.png");
    });

    act(() => {
      hook.current.reset("a.png");
    });
    expect(hook.current.operations.map((op) => op.key)).toEqual(["b.png"]);

    act(() => {
      hook.current.reset();
    });
    expect(hook.current.get("b.png")?.phase).toBe("deleting");

    let outcome: DeleteOutcome | undefined;
    await act(async () => {
      request.resolve({ key: "b.png", bucket: "bucket" });
      outcome = await running;
    });
    expect(outcome?.status).toBe("success");
    expect(hook.current.get("b.png")?.phase).toBe("success");

    act(() => {
      hook.current.reset();
    });
    expect(hook.current.operations).toEqual([]);
    expect(hook.current.reset).toBe(reset);
  });

  it("keeps instanceId stable across renders", () => {
    const { hook } = setup();
    const { instanceId } = hook.current;

    hook.rerender();

    expect(instanceId).toEqual(expect.any(String));
    expect(hook.current.instanceId).toBe(instanceId);
  });
});
