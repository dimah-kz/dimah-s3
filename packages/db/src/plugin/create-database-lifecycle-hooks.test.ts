import { describe, expect, it } from "vitest";
import { createDatabaseLifecycleHooks } from "./create-database-lifecycle-hooks";
import { fakeStore, sampleObject } from "@/test/fakes";

const request = new Request("http://local");
const route = "uploads";

describe("createDatabaseLifecycleHooks", () => {
  it("tracks pending uploads for the resolved scope", async () => {
    const store = fakeStore();
    const { hooks } = createDatabaseLifecycleHooks({
      client: store,
      resolveScope: async () => "user:1",
    });

    await hooks.upload?.onPresigned?.({
      request,
      route,
      key: "k",
      bucket: "b",
      file: { name: "a.txt", size: 10, type: "text/plain" },
      url: "https://s3.test",
      expiresIn: 600,
    });

    expect(store.upsertPending).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "user:1",
        bucket: "b",
        key: "k",
        declaredSize: 10,
        filename: "a.txt",
      }),
    );
  });

  it("promotes confirmed objects to active", async () => {
    const store = fakeStore();
    const { hooks } = createDatabaseLifecycleHooks({
      client: store,
      resolveScope: async () => "user:1",
    });

    await hooks.upload?.onConfirmed?.({
      request,
      route,
      key: "k",
      bucket: "b",
      contentLength: 10,
      eTag: "abc",
      contentType: "text/plain",
    });

    expect(store.markActive).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "k",
        size: 10,
        eTag: "abc",
      }),
    );
  });

  it("soft-deletes by default and hard-deletes when configured", async () => {
    const soft = fakeStore();
    const hard = fakeStore();
    const softHooks = createDatabaseLifecycleHooks({
      client: soft,
      resolveScope: async () => "user:1",
    }).hooks;
    const hardHooks = createDatabaseLifecycleHooks({
      client: hard,
      resolveScope: async () => "user:1",
      deleteMode: "hard",
    }).hooks;

    const ctx = { request, route, key: "k", bucket: "b" };
    await softHooks.delete?.onDeleted?.(ctx);
    await hardHooks.delete?.onDeleted?.(ctx);

    expect(soft.softDelete).toHaveBeenCalledWith({ bucket: "b", key: "k" });
    expect(hard.hardDelete).toHaveBeenCalledWith({ bucket: "b", key: "k" });
  });

  it("guards multipart part/list/abort with ownership", async () => {
    const store = fakeStore({
      find: async () => sampleObject({ scope: "user:2" }),
    });
    const { hooks } = createDatabaseLifecycleHooks({
      client: store,
      resolveScope: async () => "user:1",
    });

    const ctx = {
      request,
      route,
      key: "k",
      bucket: "b",
      uploadId: "up-1",
    };

    await expect(
      hooks.upload?.multipart?.sessionGuard?.({
        ...ctx,
        action: "part",
        partNumber: 1,
        partSize: 1024,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      hooks.upload?.multipart?.sessionGuard?.({ ...ctx, action: "list" }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      hooks.upload?.confirmGuard?.({
        ...ctx,
        parts: [{ partNumber: 1 }],
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      hooks.upload?.multipart?.sessionGuard?.({ ...ctx, action: "abort" }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("clears pending rows on multipart abort", async () => {
    const store = fakeStore();
    const { hooks } = createDatabaseLifecycleHooks({
      client: store,
      resolveScope: async () => "user:1",
    });

    await hooks.upload?.multipart?.onAbort?.({
      request,
      route,
      key: "k",
      bucket: "b",
      uploadId: "up-1",
    });
    expect(store.deletePending).toHaveBeenCalledWith({ bucket: "b", key: "k" });
  });

  it("tracks multipart init with uploadId", async () => {
    const store = fakeStore();
    const { hooks } = createDatabaseLifecycleHooks({
      client: store,
      resolveScope: async () => "user:1",
    });

    await hooks.upload?.multipart?.onInit?.({
      request,
      route,
      key: "k",
      bucket: "b",
      uploadId: "up-1",
      file: { name: "a.bin", size: 100 },
    });

    expect(store.upsertPending).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "user:1",
        uploadId: "up-1",
        declaredSize: 100,
      }),
    );
  });

  it("rejects unauthenticated uploads", async () => {
    const { hooks } = createDatabaseLifecycleHooks({
      client: fakeStore(),
      resolveScope: async () => null,
    });

    await expect(
      hooks.upload?.guard?.({
        request,
        route,
        key: "k",
        bucket: "b",
        file: { name: "a.txt" },
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("does not confirm a deleted object", async () => {
    const store = fakeStore({
      find: async () => sampleObject({ status: "deleted" }),
    });
    const { hooks } = createDatabaseLifecycleHooks({
      client: store,
      resolveScope: async () => "user:1",
    });

    await expect(
      hooks.upload?.confirmGuard?.({ request, route, key: "k", bucket: "b" }),
    ).rejects.toMatchObject({ code: "OBJECT_NOT_FOUND" });
  });
});
