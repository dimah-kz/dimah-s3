import { describe, expect, it } from "vitest";
import { formatEta } from "./format-eta";
import { formatSpeed } from "./format-speed";
import { formatAcceptLabels } from "./format-accept-labels";
import { createSpeedTracker } from "./speed-tracker";
import { createMemoryStore } from "../store/memory-store";

describe("format helpers", () => {
  it("formatSpeed / formatEta", () => {
    expect(formatSpeed(1024)).toContain("/s");
    expect(formatEta(1000, 100)).toMatch(/s|m|h/);
  });

  it("formatAcceptLabels", () => {
    expect(formatAcceptLabels([".png", "image/*"])).toEqual(["PNG", "Images"]);
  });
});

describe("createSpeedTracker", () => {
  it("returns 0 until enough samples", () => {
    const tracker = createSpeedTracker();
    expect(tracker.update(0)).toBe(0);
  });
});

describe("createMemoryStore", () => {
  it("persists and matches size", async () => {
    const store = createMemoryStore();
    await store.set({
      uploadId: "u1",
      key: "k",
      fileSize: 10,
      bucket: "b",
    });
    expect(await store.get("k", 10)).toMatchObject({ uploadId: "u1" });
    expect(await store.get("k", 11)).toBeNull();
    await store.delete("k");
    expect(await store.get("k", 10)).toBeNull();
  });
});
