import { beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalStorageUploadStore } from "./local-storage-store";
import { createMemoryUploadStore } from "./memory-store";
import type { StoredUpload } from "@/types/upload-store";

const resumeKey = "uploads:photo.jpg:10:1";
const storageKey = `dimah-s3:upload:${resumeKey}`;

const sample: StoredUpload = {
  resumeKey,
  ticket: "v1.payload.signature",
  key: "uploads/uuid/photo.jpg",
  uploadId: "u1",
  fileSize: 10,
  partSize: 8,
  partCount: 2,
  checksum: false,
};

describe("createMemoryUploadStore", () => {
  it("returns a record only for its file size", async () => {
    const store = createMemoryUploadStore();
    await store.set(sample);
    expect(await store.get(resumeKey, 10)).toEqual(sample);
    expect(await store.get(resumeKey, 11)).toBeNull();
    await store.delete(resumeKey);
    expect(await store.get(resumeKey, 10)).toBeNull();
  });
});

describe("createLocalStorageUploadStore", () => {
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

  it("round-trips a record for its file size", async () => {
    const store = createLocalStorageUploadStore();
    await store.set(sample);
    expect(JSON.parse(map.get(storageKey) ?? "")).toEqual(sample);
    expect(await store.get(resumeKey, 10)).toEqual(sample);
    expect(await store.get(resumeKey, 11)).toBeNull();
    expect(map.has(storageKey)).toBe(true);
    await store.delete(resumeKey);
    expect(await store.get(resumeKey, 10)).toBeNull();
  });

  it("ignores and deletes a 1.x record", async () => {
    map.set(
      storageKey,
      JSON.stringify({
        resumeKey,
        uploadId: "u1",
        key: "uploads/uuid/photo.jpg",
        fileSize: 10,
      }),
    );
    expect(await createLocalStorageUploadStore().get(resumeKey, 10)).toBeNull();
    expect(map.has(storageKey)).toBe(false);
  });

  it("ignores and deletes invalid JSON", async () => {
    map.set(storageKey, "{");
    expect(await createLocalStorageUploadStore().get(resumeKey, 10)).toBeNull();
    expect(map.has(storageKey)).toBe(false);
  });

  it("ignores and deletes a record stored under another resume key", async () => {
    map.set(
      storageKey,
      JSON.stringify({ ...sample, resumeKey: "other:file:10:1" }),
    );
    expect(await createLocalStorageUploadStore().get(resumeKey, 10)).toBeNull();
    expect(map.has(storageKey)).toBe(false);
  });

  it("does nothing when localStorage is unavailable", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
      removeItem: () => {
        throw new Error("denied");
      },
    });
    const store = createLocalStorageUploadStore();
    expect(() => store.set(sample)).not.toThrow();
    expect(store.get(resumeKey, 10)).toBeNull();
    expect(() => store.delete(resumeKey)).not.toThrow();
  });
});
