import { describe, expect, it, vi } from "vitest";
import { purgeStalePendingObjects } from "./purge-stale-pending";
import { fakeStore, sampleObject } from "@/test/fakes";

describe("purgeStalePendingObjects", () => {
  it("returns early when nothing is stale", async () => {
    const store = fakeStore();
    await expect(purgeStalePendingObjects({ client: store })).resolves.toEqual({
      purged: [],
    });
    expect(store.deleteByIds).not.toHaveBeenCalled();
  });

  it("deletes stale rows after onBeforePurge", async () => {
    const stale = [sampleObject({ id: "1", status: "pending" })];
    const store = fakeStore({
      findStalePending: vi.fn(async () => stale),
    });
    const onBeforePurge = vi.fn();

    await expect(
      purgeStalePendingObjects({ client: store, onBeforePurge }),
    ).resolves.toEqual({ purged: stale });

    expect(onBeforePurge).toHaveBeenCalledWith(stale);
    expect(store.deleteByIds).toHaveBeenCalledWith(["1"]);
  });

  it("keeps rows when onBeforePurge throws", async () => {
    const store = fakeStore({
      findStalePending: vi.fn(async () => [sampleObject({ id: "1" })]),
    });
    await expect(
      purgeStalePendingObjects({
        client: store,
        onBeforePurge: () => {
          throw new Error("abort multipart failed");
        },
      }),
    ).rejects.toThrow("abort multipart failed");
    expect(store.deleteByIds).not.toHaveBeenCalled();
  });

  it("aborts multipart and deletes S3 objects when s3 is set", async () => {
    const stale = [
      sampleObject({ id: "1", status: "pending", uploadId: "up-1" }),
    ];
    const store = fakeStore({
      findStalePending: vi.fn(async () => stale),
    });
    const send = vi.fn(async () => ({}));

    await expect(
      purgeStalePendingObjects({
        client: store,
        s3: { send } as never,
      }),
    ).resolves.toEqual({ purged: stale });

    expect(send).toHaveBeenCalledTimes(2);
    expect(store.deleteByIds).toHaveBeenCalledWith(["1"]);
  });
});
