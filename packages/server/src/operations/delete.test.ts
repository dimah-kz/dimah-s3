import { DeleteObjectCommand, S3ServiceException } from "@aws-sdk/client-s3";
import { s3Error } from "@dimah-s3/core";
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
import { deleteStoredObject } from "./delete";

const KEY = "uploads/a.png";

/** A resolved config whose `uploads` route has the given delete settings. */
function setup(
  remove: Partial<ResolvedDelete> = {},
  config: Partial<ResolvedConfig> = {},
) {
  const s3 = memoryS3();
  s3.seed(KEY, "0123456789", { contentType: "image/png" });
  const resolved = testConfig({
    routes: {
      uploads: testRoute({ client: s3.client, delete: testDelete(remove) }),
    },
    ...config,
  });
  return { s3, config: resolved };
}

function commandNames(s3: ReturnType<typeof memoryS3>): string[] {
  return s3.send.mock.calls.map(
    ([command]) => (command as object).constructor.name,
  );
}

describe("deleteStoredObject", () => {
  it("deletes the object with one DeleteObject and no HeadObject", async () => {
    const { s3, config } = setup();

    await expect(
      deleteStoredObject(config, { route: "uploads", key: KEY }),
    ).resolves.toEqual({ key: KEY, bucket: TEST_BUCKET });
    expect(s3.get(KEY)).toBeUndefined();
    expect(commandNames(s3)).toEqual([DeleteObjectCommand.name]);
  });

  it("succeeds for a missing object and still runs onDeleted", async () => {
    const onDeleted = vi.fn();
    const { config } = setup({ onDeleted: [{ hook: onDeleted }] });

    await expect(
      deleteStoredObject(config, { route: "uploads", key: "uploads/gone.png" }),
    ).resolves.toEqual({ key: "uploads/gone.png", bucket: TEST_BUCKET });
    expect(onDeleted).toHaveBeenCalledOnce();
  });

  it("returns no existed field and passes none to onDeleted", async () => {
    const onDeleted = vi.fn();
    const { config } = setup({ onDeleted: [{ hook: onDeleted }] });

    const result = await deleteStoredObject(config, {
      route: "uploads",
      key: KEY,
    });
    expect(result).not.toHaveProperty("existed");
    expect(onDeleted.mock.calls[0]?.[0]).not.toHaveProperty("existed");
  });

  it("deletes after the client went away, so onDeleted sees every delete", async () => {
    const onDeleted = vi.fn();
    const { s3, config } = setup({ onDeleted: [{ hook: onDeleted }] });
    const request = new Request("http://localhost/api/s3/delete", {
      signal: AbortSignal.abort(),
    });

    await deleteStoredObject(
      config,
      { route: "uploads", key: KEY },
      { request },
    );
    expect(s3.send).toHaveBeenCalledWith(expect.any(DeleteObjectCommand));
    expect(s3.get(KEY)).toBeUndefined();
    expect(onDeleted).toHaveBeenCalledOnce();
  });
});

describe("deleteStoredObject hooks", () => {
  it("runs the route guard, delete.guard, the delete, then onDeleted with plugins first", async () => {
    const order: string[] = [];
    const s3 = memoryS3();
    s3.send.mockImplementation(async () => {
      order.push("s3");
      return {};
    });
    let guardContext: DeleteGuardContext | undefined;
    let deletedContext: DeleteOnDeletedContext | undefined;
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
                  order.push("guard");
                  guardContext = context;
                },
              },
            ],
            onDeleted: [
              { plugin: "db", hook: () => void order.push("plugin") },
              {
                hook: (context) => {
                  order.push("user");
                  deletedContext = context;
                },
              },
            ],
          }),
        }),
      },
    });

    await deleteStoredObject(config, { route: "uploads", key: KEY });
    expect(order).toEqual(["route", "guard", "s3", "plugin", "user"]);
    const expected = {
      request: expect.any(Request),
      operation: "delete",
      route: "uploads",
      key: KEY,
      bucket: TEST_BUCKET,
      locals: { userId: "u1" },
    };
    expect(guardContext).toEqual(expected);
    expect(deletedContext).toEqual(expected);
  });

  it("keeps the object and skips onDeleted when delete.guard rejects", async () => {
    const onDeleted = vi.fn();
    const { s3, config } = setup({
      guard: [
        {
          hook: () => {
            throw s3Error("FORBIDDEN");
          },
        },
      ],
      onDeleted: [{ hook: onDeleted }],
    });

    await expect(
      deleteStoredObject(config, { route: "uploads", key: KEY }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", statusCode: 403 });
    expect(s3.send).not.toHaveBeenCalled();
    expect(s3.get(KEY)).toBeDefined();
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it("returns 500 for a plain error from onDeleted after the object is gone", async () => {
    const error = vi.fn();
    const { s3, config } = setup(
      {
        onDeleted: [
          {
            hook: () => {
              throw new Error("bookkeeping failed");
            },
          },
        ],
      },
      { logger: { error } },
    );

    await expect(
      deleteStoredObject(config, { route: "uploads", key: KEY }),
    ).rejects.toMatchObject({ code: "INTERNAL_ERROR", statusCode: 500 });
    expect(s3.get(KEY)).toBeUndefined();
    expect(error).toHaveBeenCalledWith("bookkeeping failed", expect.any(Error));
  });
});

describe("deleteStoredObject errors", () => {
  it("rejects a key outside the route namespace", async () => {
    const { s3, config } = setup();

    await expect(
      deleteStoredObject(config, { route: "uploads", key: "other/a.png" }),
    ).rejects.toMatchObject({ code: "KEY_INVALID", statusCode: 400 });
    expect(s3.send).not.toHaveBeenCalled();
  });

  it("rejects an unknown route", async () => {
    const { config } = setup();

    await expect(
      deleteStoredObject(config, { route: "avatars", key: KEY }),
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
      deleteStoredObject(config, { route: "uploads", key: KEY }),
    ).rejects.toMatchObject({
      code: "FEATURE_DISABLED",
      params: { feature: "delete" },
    });
    expect(s3.send).not.toHaveBeenCalled();
  });

  it("maps an S3 failure to INTERNAL_ERROR and skips onDeleted", async () => {
    const onDeleted = vi.fn();
    const error = vi.fn();
    const { s3, config } = setup(
      { onDeleted: [{ hook: onDeleted }] },
      { logger: { error } },
    );
    s3.send.mockRejectedValueOnce(
      new S3ServiceException({
        name: "AccessDenied",
        $fault: "client",
        $metadata: { httpStatusCode: 403 },
        message: "Access Denied",
      }),
    );

    await expect(
      deleteStoredObject(config, { route: "uploads", key: KEY }),
    ).rejects.toMatchObject({ code: "INTERNAL_ERROR", statusCode: 500 });
    expect(onDeleted).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledOnce();
  });
});
