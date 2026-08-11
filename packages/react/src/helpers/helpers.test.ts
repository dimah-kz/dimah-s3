import { describe, expect, it } from "vitest";
import { formatEta } from "./format-eta";
import { formatSpeed } from "./format-speed";
import { formatAcceptLabels } from "./format-accept-labels";
import { toDropzoneAccept } from "./to-dropzone-accept";
import { createSpeedTracker } from "./speed-tracker";
import { createMemoryStore } from "../store/memory-store";
import {
  createHookStore,
  patchHookState,
  replaceHookState,
} from "../store/create-hook-store";

describe("format helpers", () => {
  it("formatSpeed / formatEta", () => {
    expect(formatSpeed(1024)).toContain("/s");
    expect(formatEta(1000, 100)).toMatch(/s|m|h/);
  });

  it("formatAcceptLabels", () => {
    expect(formatAcceptLabels([".png", "image/*"])).toEqual(["PNG", "Images"]);
  });
});

describe("toDropzoneAccept", () => {
  it("returns undefined for empty input", () => {
    expect(toDropzoneAccept(undefined)).toBeUndefined();
    expect(toDropzoneAccept([])).toBeUndefined();
  });

  it("maps MIME wildcards and bare extensions", () => {
    expect(toDropzoneAccept(["image/*", ".pdf", "PDF"])).toEqual({
      "image/*": [],
      "*/*": [".pdf"],
    });
  });

  it("keeps explicit MIME types", () => {
    expect(toDropzoneAccept(["application/json", "text/plain"])).toEqual({
      "application/json": [],
      "text/plain": [],
    });
  });
});

describe("createHookStore", () => {
  it("supports immer drafts and replace", () => {
    type State = {
      phase: "idle" | "uploading";
      files: Array<{ id: string; progress: number }>;
    };
    const initial: State = { phase: "idle", files: [] };
    const store = createHookStore(initial);

    patchHookState(store, (draft) => {
      draft.phase = "uploading";
      draft.files.push({ id: "a", progress: 0 });
    });
    expect(store.getState()).toMatchObject({
      phase: "uploading",
      files: [{ id: "a", progress: 0 }],
    });

    patchHookState(store, (draft) => {
      const file = draft.files.find((f) => f.id === "a");
      if (file) file.progress = 42;
    });
    expect(store.getState().files[0]?.progress).toBe(42);

    replaceHookState(store, initial);
    expect(store.getState()).toEqual(initial);
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
