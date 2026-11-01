import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { isAPIError, s3Error } from "@dimah-s3/core";
import { describe, expect, it, vi } from "vitest";
import { memoryS3 } from "@/test/harness";
import type { GuardContext, UploadOnConfirmedContext } from "@/types";
import type { Guard, LifecycleHook } from "@/types/locals";
import type { HookList } from "@/types/resolved";
import { toAPIError } from "./error-boundary";
import { createLocals, runGuards, runLifecycle } from "./hooks";

function guardContext(): GuardContext {
  return {
    request: new Request("http://localhost/api/s3"),
    operation: "upload",
    locals: createLocals(),
  };
}

describe("createLocals", () => {
  it("creates a null-prototype object", () => {
    const locals = createLocals();
    expect(Object.getPrototypeOf(locals)).toBeNull();
    expect(Object.keys(locals)).toEqual([]);
  });

  it("copies the seed instead of aliasing it", () => {
    const seed = { userId: "u1" };
    const locals = createLocals(seed);
    expect(locals).toEqual({ userId: "u1" });
    seed.userId = "u2";
    expect(locals).toEqual({ userId: "u1" });
  });
});

describe("runGuards", () => {
  it("runs plugin guards in order, then the user guard", async () => {
    const calls: string[] = [];
    const guards: HookList<Guard<GuardContext>> = [
      { plugin: "a", hook: () => void calls.push("a") },
      { plugin: "b", hook: () => void calls.push("b") },
      { hook: () => void calls.push("user") },
    ];
    await runGuards(guards, guardContext());
    expect(calls).toEqual(["a", "b", "user"]);
  });

  it("merges each { locals } result so later guards see it", async () => {
    const seen = vi.fn();
    const context = guardContext();
    await runGuards(
      [
        { plugin: "auth", hook: () => ({ locals: { userId: "u1" } }) },
        {
          hook: (ctx) => {
            seen({ ...ctx.locals });
            return { locals: { role: "admin" } };
          },
        },
      ],
      context,
    );
    expect(seen).toHaveBeenCalledWith({ userId: "u1" });
    expect(context.locals).toEqual({ userId: "u1", role: "admin" });
  });

  it("stores a __proto__ key as data without touching prototypes", async () => {
    const context = guardContext();
    const locals = JSON.parse('{"__proto__": {"polluted": true}}') as object;
    await runGuards([{ hook: () => ({ locals }) }], context);
    expect(Object.getPrototypeOf(context.locals)).toBeNull();
    expect(Object.hasOwn(context.locals, "__proto__")).toBe(true);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it("stops at the first rejection", async () => {
    const rejection = s3Error("FORBIDDEN");
    const later = vi.fn();
    await expect(
      runGuards(
        [
          {
            hook: () => {
              throw rejection;
            },
          },
          { hook: later },
        ],
        guardContext(),
      ),
    ).rejects.toBe(rejection);
    expect(later).not.toHaveBeenCalled();
  });
});

describe("runLifecycle", () => {
  const key = "uploads/a.png";

  function confirmedContext(): UploadOnConfirmedContext {
    return {
      ...guardContext(),
      operation: "confirm",
      route: "uploads",
      key,
      bucket: "bucket",
      kind: "put",
      uploadToken: "token",
      file: { name: "a.png", size: 3 },
      acl: "private",
      object: { size: 3, metadata: {} },
    };
  }

  /** What confirm does: a plugin failure deletes the object it just verified. */
  async function confirm(
    s3: ReturnType<typeof memoryS3>,
    hooks: HookList<LifecycleHook<UploadOnConfirmedContext>>,
  ) {
    const context = confirmedContext();
    try {
      await runLifecycle(hooks, context, {
        onPluginError: async () => {
          await s3.client.send(
            new DeleteObjectCommand({ Bucket: "bucket", Key: key }),
          );
        },
      });
    } catch (error) {
      throw toAPIError(error, { logger: {} }, context.request);
    }
  }

  it("runs the plugin onConfirmed before the user's", async () => {
    const calls: string[] = [];
    await runLifecycle(
      [
        { plugin: "db", hook: () => void calls.push("db") },
        { hook: () => void calls.push("user") },
      ],
      confirmedContext(),
    );
    expect(calls).toEqual(["db", "user"]);
  });

  it("deletes the object when a plugin onConfirmed throws", async () => {
    const s3 = memoryS3();
    s3.seed(key, "abc");
    const quota = s3Error("QUOTA_EXCEEDED", { limit: "bytes" });
    const user = vi.fn();

    await expect(
      confirm(s3, [
        {
          plugin: "db",
          hook: () => {
            throw quota;
          },
        },
        { hook: user },
      ]),
    ).rejects.toBe(quota);

    expect(user).not.toHaveBeenCalled();
    expect(s3.get(key)).toBeUndefined();
  });

  it("keeps the object and returns 500 when the user onConfirmed throws", async () => {
    const s3 = memoryS3();
    s3.seed(key, "abc");
    const error = await confirm(s3, [
      { plugin: "db", hook: () => {} },
      {
        hook: () => {
          throw new Error("webhook failed");
        },
      },
    ]).catch((thrown: unknown) => thrown);

    expect(isAPIError(error)).toBe(true);
    expect(error).toMatchObject({ code: "INTERNAL_ERROR", statusCode: 500 });
    expect(s3.get(key)).toBeDefined();
  });
});
