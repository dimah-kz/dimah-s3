import { DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { APIError, s3Error } from "@dimah-s3/core";
import { describe, expect, it, vi } from "vitest";
import {
  memoryS3,
  TEST_BUCKET,
  testConfig,
  testDelete,
  testRoute,
} from "@/test/harness";
import type { DeleteGuardContext, DeleteOnDeletedContext } from "@/types";
import type { ResolvedConfig, ResolvedDelete } from "@/types/resolved";
import { deleteManyObjects } from "./delete-many";

const A = "uploads/a.png";
const B = "uploads/b.png";
const C = "uploads/c.png";

/** A resolved config whose `uploads` route has the given delete settings. */
function setup(
  remove: Partial<ResolvedDelete> = {},
  config: Partial<ResolvedConfig> = {},
) {
  const s3 = memoryS3();
  for (const key of [A, B, C]) s3.seed(key, "0123456789");
  const resolved = testConfig({
    routes: {
      uploads: testRoute({ client: s3.client, delete: testDelete(remove) }),
    },
    ...config,
  });
  return { s3, config: resolved };
}

/** Keys of every DeleteObjects request, in call order. */
function deleteRequests(s3: ReturnType<typeof memoryS3>): string[][] {
  return s3.send.mock.calls
    .map(([command]) => command)
    .filter((command) => command instanceof DeleteObjectsCommand)
    .map((command) =>
      (command.input.Delete?.Objects ?? []).map(({ Key }) => Key ?? ""),
    );
}

/** A `delete.guard` that rejects `key` and allows the rest. */
function rejectKey(key: string, error: unknown = s3Error("FORBIDDEN")) {
  return (context: DeleteGuardContext) => {
    if (context.key === key) throw error;
  };
}

describe("deleteManyObjects", () => {
  it("deletes every key with one quiet DeleteObjects request", async () => {
    const { s3, config } = setup();

    await expect(
      deleteManyObjects(config, { route: "uploads", keys: [A, B, C] }),
    ).resolves.toEqual({ deleted: [A, B, C], failed: [] });
    expect(s3.send).toHaveBeenCalledOnce();
    const [command] = s3.send.mock.calls[0] ?? [];
    expect(command).toBeInstanceOf(DeleteObjectsCommand);
    expect((command as DeleteObjectsCommand).input).toEqual({
      Bucket: TEST_BUCKET,
      Delete: { Objects: [{ Key: A }, { Key: B }, { Key: C }], Quiet: true },
    });
    expect(s3.objects.size).toBe(0);
  });

  it("counts a missing key as deleted and runs onDeleted for it", async () => {
    const onDeleted = vi.fn();
    const { config } = setup({ onDeleted: [{ hook: onDeleted }] });

    await expect(
      deleteManyObjects(config, {
        route: "uploads",
        keys: [A, "uploads/gone.png"],
      }),
    ).resolves.toEqual({ deleted: [A, "uploads/gone.png"], failed: [] });
    expect(onDeleted).toHaveBeenCalledTimes(2);
  });

  it("sends a repeated key once", async () => {
    const onDeleted = vi.fn();
    const { s3, config } = setup({ onDeleted: [{ hook: onDeleted }] });

    await expect(
      deleteManyObjects(config, {
        route: "uploads",
        keys: [A, A, `/${A}`, B],
      }),
    ).resolves.toEqual({ deleted: [A, B], failed: [] });
    expect(deleteRequests(s3)).toEqual([[A, B]]);
    expect(onDeleted).toHaveBeenCalledTimes(2);
  });

  it("deletes after the client went away", async () => {
    const onDeleted = vi.fn();
    const { s3, config } = setup({ onDeleted: [{ hook: onDeleted }] });
    const request = new Request("http://localhost/api/s3/delete/batch", {
      signal: AbortSignal.abort(),
    });

    await expect(
      deleteManyObjects(
        config,
        { route: "uploads", keys: [A, B] },
        { request },
      ),
    ).resolves.toEqual({ deleted: [A, B], failed: [] });
    expect(s3.send).toHaveBeenCalledWith(expect.any(DeleteObjectsCommand));
    expect(onDeleted).toHaveBeenCalledTimes(2);
  });
});

describe("deleteManyObjects hooks", () => {
  it("runs the route guard once, delete.guard per key, one delete, then onDeleted per key", async () => {
    const order: string[] = [];
    const s3 = memoryS3();
    s3.send.mockImplementation(async () => {
      order.push("s3");
      return {};
    });
    const guardContexts: DeleteGuardContext[] = [];
    const deletedContexts: DeleteOnDeletedContext[] = [];
    const config = testConfig({
      routes: {
        uploads: testRoute({
          client: s3.client,
          guard: [
            {
              hook: () => {
                order.push("route");
                return { locals: { userId: "u1" } };
              },
            },
          ],
          delete: testDelete({
            guard: [
              {
                hook: (context) => {
                  order.push(`guard ${context.key}`);
                  guardContexts.push(context);
                },
              },
            ],
            onDeleted: [
              {
                plugin: "db",
                hook: (context) => void order.push(`plugin ${context.key}`),
              },
              {
                hook: (context) => {
                  order.push(`user ${context.key}`);
                  deletedContexts.push(context);
                },
              },
            ],
          }),
        }),
      },
    });

    await deleteManyObjects(config, { route: "uploads", keys: [A, B] });
    expect(order).toEqual([
      "route",
      `guard ${A}`,
      `guard ${B}`,
      "s3",
      `plugin ${A}`,
      `user ${A}`,
      `plugin ${B}`,
      `user ${B}`,
    ]);
    const expected = (key: string) => ({
      request: expect.any(Request),
      operation: "deleteMany",
      route: "uploads",
      key,
      bucket: TEST_BUCKET,
      locals: { userId: "u1" },
    });
    expect(guardContexts).toEqual([expected(A), expected(B)]);
    expect(deletedContexts).toEqual([expected(A), expected(B)]);
  });

  it("reports a key that delete.guard rejects and deletes the rest", async () => {
    const onDeleted = vi.fn();
    const { s3, config } = setup({
      guard: [{ hook: rejectKey(B) }],
      onDeleted: [{ hook: onDeleted }],
    });

    await expect(
      deleteManyObjects(config, { route: "uploads", keys: [A, B, C] }),
    ).resolves.toEqual({
      deleted: [A, C],
      failed: [{ key: B, error: { code: "FORBIDDEN", message: "Forbidden" } }],
    });
    expect(deleteRequests(s3)).toEqual([[A, C]]);
    expect(s3.get(B)).toBeDefined();
    expect(onDeleted).toHaveBeenCalledTimes(2);
  });

  it("keeps the code and params of an error a plugin defines", async () => {
    const { config } = setup({
      guard: [
        {
          plugin: "quota",
          hook: rejectKey(
            A,
            APIError.from(423, {
              code: "OBJECT_LOCKED",
              message: "Object is locked until 2026",
              params: { until: 2026 },
            }),
          ),
        },
      ],
    });

    await expect(
      deleteManyObjects(config, { route: "uploads", keys: [A] }),
    ).resolves.toEqual({
      deleted: [],
      failed: [
        {
          key: A,
          error: {
            code: "OBJECT_LOCKED",
            message: "Object is locked until 2026",
            params: { until: 2026 },
          },
        },
      ],
    });
  });

  it("skips S3 when every key is rejected", async () => {
    const { s3, config } = setup({
      guard: [
        {
          hook: () => {
            throw s3Error("FORBIDDEN");
          },
        },
      ],
    });

    const result = await deleteManyObjects(config, {
      route: "uploads",
      keys: [A, B],
    });
    expect(result.deleted).toEqual([]);
    expect(result.failed.map(({ key }) => key)).toEqual([A, B]);
    expect(s3.send).not.toHaveBeenCalled();
  });

  it("reports a key whose onDeleted throws and still runs the others", async () => {
    const error = vi.fn();
    const onDeleted = vi.fn((context: DeleteOnDeletedContext) => {
      if (context.key === A) throw new Error("bookkeeping failed");
    });
    const { s3, config } = setup(
      { onDeleted: [{ plugin: "db", hook: onDeleted }] },
      { logger: { error } },
    );

    await expect(
      deleteManyObjects(config, { route: "uploads", keys: [A, B] }),
    ).resolves.toEqual({
      deleted: [B],
      failed: [
        {
          key: A,
          error: { code: "INTERNAL_ERROR", message: "Internal server error" },
        },
      ],
    });
    expect(onDeleted).toHaveBeenCalledTimes(2);
    expect(s3.get(A)).toBeUndefined();
    expect(error).toHaveBeenCalledWith("bookkeeping failed", expect.any(Error));
  });
});

describe("deleteManyObjects errors", () => {
  it("reports a key outside the route namespace as sent", async () => {
    const { s3, config } = setup();

    await expect(
      deleteManyObjects(config, {
        route: "uploads",
        keys: [A, "other/a.png"],
      }),
    ).resolves.toEqual({
      deleted: [A],
      failed: [
        {
          key: "other/a.png",
          error: { code: "KEY_INVALID", message: "Object key is invalid" },
        },
      ],
    });
    expect(deleteRequests(s3)).toEqual([[A]]);
  });

  it("reports per-key S3 errors as INTERNAL_ERROR, logs them and skips onDeleted", async () => {
    const error = vi.fn();
    const onError = vi.fn();
    const onDeleted = vi.fn();
    const { s3, config } = setup(
      { onDeleted: [{ hook: onDeleted }] },
      { logger: { error }, onError },
    );
    s3.deleteErrors.set(B, { Code: "AccessDenied", Message: "Access Denied" });

    await expect(
      deleteManyObjects(config, { route: "uploads", keys: [A, B] }),
    ).resolves.toEqual({
      deleted: [A],
      failed: [
        {
          key: B,
          error: { code: "INTERNAL_ERROR", message: "Internal server error" },
        },
      ],
    });
    expect(s3.get(B)).toBeDefined();
    expect(onDeleted).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ key: A }),
    );
    expect(error).toHaveBeenCalledWith(
      `DeleteObjects failed for "${B}": AccessDenied: Access Denied`,
      expect.any(Error),
    );
    expect(onError).toHaveBeenCalledOnce();
  });

  it("fails the call when the DeleteObjects request fails", async () => {
    const onDeleted = vi.fn();
    const { s3, config } = setup({ onDeleted: [{ hook: onDeleted }] });
    s3.send.mockRejectedValueOnce(
      Object.assign(new Error("connect ECONNREFUSED"), {
        code: "ECONNREFUSED",
      }),
    );

    await expect(
      deleteManyObjects(config, { route: "uploads", keys: [A, B] }),
    ).rejects.toMatchObject({
      code: "S3_NETWORK_ERROR",
      params: { code: "ECONNREFUSED" },
    });
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it("fails the call when the route guard rejects", async () => {
    const s3 = memoryS3();
    const config = testConfig({
      routes: {
        uploads: testRoute({
          client: s3.client,
          guard: [
            {
              hook: () => {
                throw s3Error("UNAUTHORIZED");
              },
            },
          ],
        }),
      },
    });

    await expect(
      deleteManyObjects(config, { route: "uploads", keys: [A] }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED", statusCode: 401 });
    expect(s3.send).not.toHaveBeenCalled();
  });

  it("rejects an unknown route", async () => {
    const { config } = setup();

    await expect(
      deleteManyObjects(config, { route: "avatars", keys: [A] }),
    ).rejects.toMatchObject({
      code: "UNKNOWN_ROUTE",
      params: { route: "avatars" },
    });
  });

  it("rejects a route without delete", async () => {
    const s3 = memoryS3();
    const config = testConfig({
      routes: {
        uploads: testRoute({ client: s3.client, delete: { enabled: false } }),
      },
    });

    await expect(
      deleteManyObjects(config, { route: "uploads", keys: [A] }),
    ).rejects.toMatchObject({
      code: "FEATURE_DISABLED",
      params: { feature: "delete" },
    });
    expect(s3.send).not.toHaveBeenCalled();
  });
});
