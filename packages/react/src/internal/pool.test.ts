import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "./pool";

function tick() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe("mapWithConcurrency", () => {
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
