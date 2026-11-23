import { describe, expect, it } from "vitest";
import { createLruCache } from "./lru";

describe("createLruCache", () => {
  it("evicts the least recently used entry", () => {
    const cache = createLruCache<string, number>(2);
    cache.set("a", 1);
    cache.set("b", 2);

    expect(cache.get("a")).toBe(1);
    cache.set("c", 3);

    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBe(1);
    expect(cache.get("c")).toBe(3);
    expect(cache.size).toBe(2);
  });

  it("refreshes an entry when it is set again", () => {
    const cache = createLruCache<string, number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("a", 10);
    cache.set("c", 3);

    expect(cache.get("a")).toBe(10);
    expect(cache.get("b")).toBeUndefined();
  });

  it("deletes and clears entries", () => {
    const cache = createLruCache<string, number>(3);
    cache.set("a", 1);
    cache.set("b", 2);

    expect(cache.delete("a")).toBe(true);
    expect(cache.delete("a")).toBe(false);
    cache.clear();
    expect(cache.size).toBe(0);
  });

  it("rejects a size below one", () => {
    expect(() => createLruCache(0)).toThrow(RangeError);
    expect(() => createLruCache(1.5)).toThrow(RangeError);
  });
});
