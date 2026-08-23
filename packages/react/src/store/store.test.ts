import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "../test/render-hook";
import { useImmerState } from "./use-immer-state";
import { createLocalStorageStore } from "./local-storage-store";
import { createMemoryStore } from "./memory-store";

const sample = {
  uploadId: "u1",
  key: "k",
  fileSize: 10,
  bucket: "b",
};

describe("useImmerState", () => {
  it("supports immer drafts and replace", () => {
    type State = {
      phase: "idle" | "uploading";
      files: Array<{ id: string; progress: number }>;
    };
    const initial: State = { phase: "idle", files: [] };
    const hook = renderHook(() => useImmerState(initial));

    act(() => {
      hook.current[1]((draft) => {
        draft.phase = "uploading";
        draft.files.push({ id: "a", progress: 0 });
      });
    });
    expect(hook.current[0]).toMatchObject({
      phase: "uploading",
      files: [{ id: "a", progress: 0 }],
    });

    act(() => {
      hook.current[1]((draft) => {
        const file = draft.files.find((f) => f.id === "a");
        if (file) file.progress = 42;
      });
    });
    expect(hook.current[0].files[0]?.progress).toBe(42);

    act(() => {
      hook.current[2](initial);
    });
    expect(hook.current[0]).toEqual(initial);
    hook.unmount();
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
  const map = new Map<string, string>();
  const storage = {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    clear: () => map.clear(),
  };

  beforeEach(() => {
    map.clear();
    vi.stubGlobal("localStorage", storage);
  });

  afterEach(() => {
    map.clear();
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
