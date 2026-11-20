import { describe, expect, it } from "vitest";
import { concurrencyLimit, mapWithConcurrency } from "./pool";

function tick() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe("concurrencyLimit", () => {
  it.each([
    [undefined, 4],
    [Number.NaN, 4],
    [3, 3],
    [2.9, 2],
    [0, 1],
    [-5, 1],
    [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
  ])("%s → %s", (value, expected) => {
    expect(concurrencyLimit(value, 4)).toBe(expected);
  });
});

describe("mapWithConcurrency", () => {
  it("still runs every item when the limit is not a number", async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], Number.NaN, async (value) => value * 2),
    ).resolves.toEqual([2, 4, 6]);
  });

  it("keeps input order and never exceeds the limit", async () => {
    let active = 0;
    let peak = 0;

    const results = await mapWithConcurrency(
      [30, 10, 20, 0, 5],
      2,
      async (value, index) => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, value));
        active -= 1;
        return `${index}:${value}`;
      },
    );

    expect(results).toEqual(["0:30", "1:10", "2:20", "3:0", "4:5"]);
    expect(peak).toBe(2);
  });

  it("returns an empty list for no items", async () => {
    await expect(mapWithConcurrency([], 4, async () => 1)).resolves.toEqual([]);
  });

  it("rejects with the first error and starts no new task", async () => {
    const started: number[] = [];
    const error = new Error("boom");

    const result = mapWithConcurrency([0, 1, 2, 3], 2, async (value) => {
      started.push(value);
      await tick();
      if (value === 0) throw error;
      return value;
    });

    await expect(result).rejects.toBe(error);
    await tick();
    expect(started).toEqual([0, 1]);
  });
});
