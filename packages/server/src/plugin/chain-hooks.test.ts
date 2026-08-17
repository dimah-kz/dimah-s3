import { describe, expect, it, vi } from "vitest";
import { chainHooks } from "./chain-hooks";

describe("chainHooks", () => {
  it("runs hooks in order and skips undefined entries", async () => {
    const order: string[] = [];
    const run = chainHooks(
      () => {
        order.push("a");
      },
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
});
