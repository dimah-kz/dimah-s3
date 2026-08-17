import { afterEach, describe, expect, it } from "vitest";
import {
  createHookStore,
  patchHookState,
  replaceHookState,
} from "./create-hook-store";
import { createLocalStorageStore } from "./local-storage-store";
import { createMemoryStore } from "./memory-store";

const sample = {
  uploadId: "u1",
  key: "k",
  fileSize: 10,
  bucket: "b",
};

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

describe("createMemoryStore", () => {
  it("persists only when the size matches", async () => {
    const store = createMemoryStore();
    await store.set(sample);
    expect(await store.get("k", 10)).toMatchObject({ uploadId: "u1" });
    expect(await store.get("k", 11)).toBeNull();
    await store.delete("k");
    expect(await store.get("k", 10)).toBeNull();
  });
});

describe("createLocalStorageStore", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("round-trips the same key and size", async () => {
    const store = createLocalStorageStore();
    await store.set(sample);
    expect(await store.get("k", 10)).toEqual(sample);
    expect(await store.get("k", 11)).toBeNull();
    await store.delete("k");
    expect(await store.get("k", 10)).toBeNull();
  });

  it("returns null for invalid JSON", async () => {
    localStorage.setItem("dimah-s3:upload:k", "{");
    expect(await createLocalStorageStore().get("k", 10)).toBeNull();
  });
});
