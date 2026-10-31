import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { ConfigError } from "@/helpers/error-boundary";
import { createLocals, runGuards } from "@/helpers/hooks";
import type { GuardContext } from "@/types/hook-contexts";
import type { DimahS3Locals, Guard, LifecycleHook } from "@/types/locals";
import { chainHooks } from "./chain-hooks";

type TestLocals = { userId?: string; role?: string };

function guardContext(): GuardContext {
  return {
    request: new Request("http://localhost/api/s3"),
    operation: "upload",
    locals: createLocals(),
  };
}

describe("chainHooks", () => {
  it("runs hooks in order and skips undefined entries", async () => {
    const order: string[] = [];
    const run = chainHooks<{ n: number }>(
      () => void order.push("a"),
      undefined,
      async () => {
        order.push("b");
      },
    );

    await run({ n: 1 });
    expect(order).toEqual(["a", "b"]);
  });

  it("stops when a hook throws", async () => {
    const later = vi.fn();
    const run = chainHooks(() => {
      throw new Error("stop");
    }, later);

    await expect(run({})).rejects.toThrow("stop");
    expect(later).not.toHaveBeenCalled();
  });

  it("gives later guards the locals of earlier ones", async () => {
    const plan = vi.fn((context: GuardContext) => ({
      locals: { role: `pro:${(context.locals as TestLocals).userId}` },
    }));
    const context = guardContext();

    await runGuards(
      [{ hook: chainHooks(() => ({ locals: { userId: "u1" } }), plan) }],
      context,
    );

    expect({ ...context.locals }).toEqual({ userId: "u1", role: "pro:u1" });
  });

  it("passes an unexpected guard result on, so the server rejects it", async () => {
    const later = vi.fn();
    const chained = chainHooks<GuardContext>(
      (() => false) as unknown as Guard<GuardContext>,
      later,
    );

    await expect(
      runGuards([{ hook: chained }], guardContext()),
    ).rejects.toBeInstanceOf(ConfigError);
    expect(later).toHaveBeenCalled();
  });

  it("types lifecycle chains as lifecycle hooks and guard chains as guards", () => {
    const lifecycle = chainHooks<GuardContext>(() => undefined);
    const guard = chainHooks((context: GuardContext) => ({
      locals: { userId: context.request.url } as Partial<DimahS3Locals>,
    }));

    expectTypeOf(lifecycle).toEqualTypeOf<LifecycleHook<GuardContext>>();
    expectTypeOf(guard).toEqualTypeOf<Guard<GuardContext>>();
    expect([typeof lifecycle, typeof guard]).toEqual(["function", "function"]);
  });
});
