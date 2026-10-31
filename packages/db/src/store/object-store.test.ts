import { afterEach, describe, expect, it, vi } from "vitest";
import { insertObject, testDatabases, useTestDatabase } from "@/test/databases";
import { createDbStore } from "./create-db-store";
import { PURGE_CLAIM_MS, type UpsertPendingInput } from "./object-store";

const MINUTE = 60_000;
const inAMinute = () => new Date(Date.now() + MINUTE);
const aMinuteAgo = () => new Date(Date.now() - MINUTE);

function pending(
  overrides: Partial<UpsertPendingInput> = {},
): UpsertPendingInput {
  return {
    bucket: "b",
    key: "k",
    scope: "user:1",
    route: "uploads",
    folder: null,
    filename: "a.txt",
    contentType: "text/plain",
    declaredSize: 100,
    uploadToken: "t1",
    expiresAt: inAMinute(),
    ...overrides,
  };
}

describe.each(testDatabases)("object store ($name)", (factory) => {
  const client = useTestDatabase(factory);
  const store = () => createDbStore<{ starred: boolean }>(client()).objects;

  describe("upsertPending", () => {
    it("writes a pending row with the ticket's token and deadline", async () => {
      const expiresAt = inAMinute();
      const written = await store().upsertPending(
        pending({ folder: "docs/q4", uploadId: "up-1", expiresAt }),
      );

      expect(written).toMatchObject({
        status: "pending",
        folder: "docs/q4",
        filename: "a.txt",
        declaredSize: 100,
        size: null,
        uploadId: "up-1",
        uploadToken: "t1",
        expiresAt,
      });
      await expect(store().find({ bucket: "b", key: "k" })).resolves.toEqual(
        written,
      );
    });

    it("resets the row for a new upload at the same key", async () => {
      await insertObject(client(), {
        key: "k",
        status: "pending",
        uploadToken: "old",
        attributes: { starred: true },
      });

      const written = await store().upsertPending(
        pending({ uploadToken: "t2" }),
      );
      expect(written).toMatchObject({
        status: "pending",
        uploadToken: "t2",
        attributes: null,
      });
      await expect(
        store().count({ scope: "user:1", status: "pending" }),
      ).resolves.toBe(1);
    });

    it("refuses to replace an active object unless overwrite is set", async () => {
      await insertObject(client(), { key: "k", uploadToken: "old", size: 5 });

      await expect(store().upsertPending(pending())).rejects.toMatchObject({
        code: "CONFLICT",
      });
      await expect(
        store().find({ bucket: "b", key: "k" }),
      ).resolves.toMatchObject({ status: "active", uploadToken: "old" });
    });

    it("keeps an overwritten object active until the overwrite is confirmed", async () => {
      const createdAt = new Date("2024-01-01T00:00:00.000Z");
      await insertObject(client(), {
        key: "k",
        folder: "avatars",
        filename: "me.png",
        size: 5,
        eTag: '"e0"',
        uploadToken: "old",
        attributes: { starred: true },
        createdAt,
      });
      const expiresAt = inAMinute();

      const written = await store().upsertPending(
        pending({ overwrite: true, folder: null, uploadId: "up-1", expiresAt }),
      );
      expect(written).toMatchObject({
        status: "active",
        folder: "avatars",
        filename: "me.png",
        size: 5,
        eTag: '"e0"',
        attributes: { starred: true },
        createdAt,
        uploadId: "up-1",
        uploadToken: "t1",
        declaredSize: 100,
        expiresAt,
      });
      await expect(store().count({ scope: "user:1" })).resolves.toBe(1);
      await expect(store().getUsage("user:1")).resolves.toEqual({
        totalBytes: 5,
        objectCount: 1,
      });
    });

    it("refuses to take over a row that purge has claimed", async () => {
      await insertObject(client(), {
        key: "k",
        status: "purging",
        uploadToken: "old",
        expiresAt: inAMinute(),
      });

      for (const overwrite of [false, true]) {
        await expect(
          store().upsertPending(pending({ overwrite })),
        ).rejects.toMatchObject({ code: "CONFLICT" });
      }
      await expect(
        store().find({ bucket: "b", key: "k" }),
      ).resolves.toMatchObject({ status: "purging", uploadToken: "old" });
    });

    it("lets one of two concurrent first uploads at a key win", async () => {
      const results = await Promise.allSettled([
        store().upsertPending(pending({ uploadToken: "t1" })),
        store().upsertPending(pending({ uploadToken: "t2" })),
      ]);

      const won = results.flatMap((result) =>
        result.status === "fulfilled" ? [result.value] : [],
      );
      const lost = results.flatMap((result) =>
        result.status === "rejected" ? [result.reason] : [],
      );
      expect(won).toHaveLength(1);
      expect(lost).toEqual([expect.objectContaining({ code: "CONFLICT" })]);
      await expect(
        store().find({ bucket: "b", key: "k" }),
      ).resolves.toMatchObject({ uploadToken: won[0]?.uploadToken });
    });

    it("reuses a deleted row", async () => {
      await insertObject(client(), { key: "k", status: "deleted" });
      await expect(store().upsertPending(pending())).resolves.toMatchObject({
        status: "pending",
        deletedAt: null,
      });
    });
  });

  describe("markActive", () => {
    const confirm = {
      bucket: "b",
      key: "k",
      uploadToken: "t1",
      size: 120,
      eTag: '"etag"',
      s3Metadata: { label: "x" },
    };

    it("promotes the pending row of the same upload", async () => {
      await store().upsertPending(pending({ uploadId: "up-1" }));

      const active = await store().markActive(confirm);
      expect(active).toMatchObject({
        status: "active",
        size: 120,
        declaredSize: null,
        eTag: '"etag"',
        s3Metadata: { label: "x" },
        uploadId: null,
        uploadToken: "t1",
        expiresAt: null,
      });
      expect(active.confirmedAt).toBeInstanceOf(Date);
    });

    it("returns the stored row on a replay", async () => {
      await store().upsertPending(pending());
      const first = await store().markActive(confirm);

      const replay = await store().markActive({ ...confirm, size: 999 });
      expect(replay).toEqual(first);
    });

    it("confirms an overwrite in place, and detects its replay", async () => {
      await insertObject(client(), {
        key: "k",
        folder: "avatars",
        size: 5,
        uploadToken: "old",
      });
      await store().upsertPending(pending({ overwrite: true }));

      const active = await store().markActive(confirm);
      expect(active).toMatchObject({
        status: "active",
        folder: "avatars",
        size: 120,
        declaredSize: null,
        eTag: '"etag"',
        uploadToken: "t1",
        expiresAt: null,
      });
      await expect(
        store().markActive({ ...confirm, size: 999 }),
      ).resolves.toEqual(active);
      await expect(
        store().markActive({ ...confirm, uploadToken: "old" }),
      ).rejects.toMatchObject({ code: "OBJECT_NOT_FOUND" });
    });

    it("rejects a token that does not match the pending row", async () => {
      await store().upsertPending(pending({ uploadToken: "newer" }));

      await expect(store().markActive(confirm)).rejects.toMatchObject({
        code: "OBJECT_NOT_FOUND",
      });
      await expect(store().find(confirm)).resolves.toMatchObject({
        status: "pending",
        uploadToken: "newer",
      });
    });

    it.each(["purging", "deleted"] as const)(
      "rejects a %s row",
      async (status) => {
        await insertObject(client(), { key: "k", status, uploadToken: "t1" });
        await expect(store().markActive(confirm)).rejects.toMatchObject({
          code: "OBJECT_NOT_FOUND",
        });
        await expect(store().find(confirm)).resolves.toMatchObject({
          status,
        });
      },
    );

    it("rejects a missing row", async () => {
      await expect(store().markActive(confirm)).rejects.toMatchObject({
        code: "OBJECT_NOT_FOUND",
      });
    });
  });

  describe("update", () => {
    it("changes the given fields of an active row", async () => {
      await insertObject(client(), { key: "k", filename: "a.txt", size: 5 });

      const updated = await store().update(
        { bucket: "b", key: "k" },
        { folder: "docs", attributes: { starred: true } },
      );
      expect(updated).toMatchObject({
        filename: "a.txt",
        folder: "docs",
        attributes: { starred: true },
      });

      const moved = await store().update(
        { bucket: "b", key: "k" },
        { filename: "b.txt", folder: null },
      );
      expect(moved).toMatchObject({
        filename: "b.txt",
        folder: null,
        attributes: { starred: true },
      });
    });

    it("returns null when no active row is there", async () => {
      await insertObject(client(), { key: "p", status: "pending" });
      const ref = (key: string) => ({ bucket: "b", key });

      await expect(
        store().update(ref("p"), { filename: "x" }),
      ).resolves.toBeNull();
      await expect(
        store().update(ref("none"), { filename: "x" }),
      ).resolves.toBeNull();
      await expect(store().find(ref("p"))).resolves.toMatchObject({
        filename: "p",
      });
    });
  });

  describe("delete", () => {
    it("soft-deletes and keeps the row, which then cannot be confirmed", async () => {
      await store().upsertPending(pending());
      await store().softDelete({ bucket: "b", key: "k" });

      const row = await store().find({ bucket: "b", key: "k" });
      expect(row).toMatchObject({ status: "deleted" });
      expect(row?.deletedAt).toBeInstanceOf(Date);
      await expect(
        store().markActive({
          bucket: "b",
          key: "k",
          uploadToken: "t1",
          size: 1,
        }),
      ).rejects.toMatchObject({ code: "OBJECT_NOT_FOUND" });
    });

    it("hard-deletes the row", async () => {
      await insertObject(client(), { key: "k" });
      await store().hardDelete({ bucket: "b", key: "k" });
      await expect(store().find({ bucket: "b", key: "k" })).resolves.toBeNull();
    });

    it("cancels a pending upload by removing its row", async () => {
      await store().upsertPending(pending());
      const ref = { bucket: "b", key: "k" };

      await store().cancelUpload({ ...ref, uploadToken: "other" });
      await expect(store().find(ref)).resolves.not.toBeNull();

      await store().cancelUpload({ ...ref, uploadToken: "t1" });
      await expect(store().find(ref)).resolves.toBeNull();
    });

    it("cancels an overwrite and keeps the previous object", async () => {
      await insertObject(client(), { key: "k", size: 5, uploadToken: "old" });
      await store().upsertPending(
        pending({ overwrite: true, uploadId: "up-1" }),
      );
      const ref = { bucket: "b", key: "k" };

      await store().cancelUpload({ ...ref, uploadToken: "t1" });
      await expect(store().find(ref)).resolves.toMatchObject({
        status: "active",
        size: 5,
        uploadId: null,
        uploadToken: null,
        declaredSize: null,
        expiresAt: null,
      });
      // A confirm of the cancelled upload is no replay.
      await expect(
        store().markActive({ ...ref, uploadToken: "t1", size: 1 }),
      ).rejects.toMatchObject({ code: "OBJECT_NOT_FOUND" });
    });

    it("leaves a confirmed row alone on cancelUpload and discardUpload", async () => {
      await insertObject(client(), { key: "k", uploadToken: "t1" });
      const upload = { bucket: "b", key: "k", uploadToken: "t1" };

      await store().cancelUpload(upload);
      await store().discardUpload(upload);
      await expect(
        store().find({ bucket: "b", key: "k" }),
      ).resolves.toMatchObject({ status: "active", uploadToken: "t1" });
    });

    it("discards the row of an upload in flight, overwrite or not", async () => {
      await store().upsertPending(pending({ key: "new" }));
      await insertObject(client(), { key: "old", uploadToken: "t0" });
      await store().upsertPending(pending({ key: "old", overwrite: true }));

      for (const key of ["new", "old"]) {
        const ref = { bucket: "b", key };
        await store().discardUpload({ ...ref, uploadToken: "other" });
        await expect(store().find(ref)).resolves.not.toBeNull();
        await store().discardUpload({ ...ref, uploadToken: "t1" });
        await expect(store().find(ref)).resolves.toBeNull();
      }
    });
  });

  describe("count and getUsage", () => {
    async function seed() {
      await insertObject(client(), { key: "a1", size: 100, folder: "docs" });
      await insertObject(client(), { key: "a2", size: 50, route: "avatars" });
      await insertObject(client(), {
        key: "live",
        status: "pending",
        declaredSize: 30,
        expiresAt: inAMinute(),
      });
      await insertObject(client(), {
        key: "expired",
        status: "pending",
        declaredSize: 1000,
        expiresAt: aMinuteAgo(),
      });
      await insertObject(client(), {
        key: "purging",
        status: "purging",
        declaredSize: 1000,
        expiresAt: aMinuteAgo(),
      });
      await insertObject(client(), {
        key: "gone",
        status: "deleted",
        size: 1000,
      });
      await insertObject(client(), {
        key: "other",
        scope: "user:2",
        size: 1000,
      });
    }

    it("counts active rows by default, and only live pending rows", async () => {
      await seed();
      const count = store().count;

      await expect(count({ scope: "user:1" })).resolves.toBe(2);
      await expect(count({ scope: "user:1", status: "pending" })).resolves.toBe(
        1,
      );
      await expect(count({ scope: "user:1", status: "deleted" })).resolves.toBe(
        1,
      );
      await expect(count({ scope: "user:1", folder: "docs" })).resolves.toBe(1);
      await expect(count({ scope: "user:1", folder: null })).resolves.toBe(1);
      await expect(count({ scope: "user:1", route: "avatars" })).resolves.toBe(
        1,
      );
    });

    it("sums active sizes and live pending declared sizes", async () => {
      await seed();
      await expect(store().getUsage("user:1")).resolves.toEqual({
        totalBytes: 180,
        objectCount: 3,
      });
      await expect(store().getUsage("user:3")).resolves.toEqual({
        totalBytes: 0,
        objectCount: 0,
      });
    });

    it("leaves the excluded row out", async () => {
      await seed();
      await expect(
        store().getUsage("user:1", { excluding: { bucket: "b", key: "live" } }),
      ).resolves.toEqual({ totalBytes: 150, objectCount: 2 });
    });
  });

  describe("purge", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    async function seed() {
      await insertObject(client(), {
        key: "old",
        status: "pending",
        uploadToken: "t-old",
        expiresAt: new Date(Date.now() - 3 * MINUTE),
      });
      await insertObject(client(), {
        key: "overwrite",
        uploadToken: "t-over",
        size: 5,
        expiresAt: new Date(Date.now() - 2 * MINUTE),
      });
      await insertObject(client(), {
        key: "stuck",
        status: "purging",
        expiresAt: aMinuteAgo(),
      });
      await insertObject(client(), {
        key: "live",
        status: "pending",
        expiresAt: inAMinute(),
      });
      await insertObject(client(), { key: "active" });
      await insertObject(client(), {
        key: "overwriting",
        uploadToken: "t-live",
        expiresAt: inAMinute(),
      });
    }

    const keys = async () =>
      (await store().findStale()).map((object) => object.key);

    it("finds stale pending rows, expired overwrites, and lapsed claims, oldest first", async () => {
      await seed();
      await expect(keys()).resolves.toEqual(["old", "overwrite", "stuck"]);
      await expect(store().findStale({ limit: 1 })).resolves.toHaveLength(1);
    });

    it("claims a stale row once and deletes it while purging", async () => {
      await seed();
      const [old] = await store().findStale({ limit: 1 });
      if (!old) throw new Error("expected a stale row");

      await expect(store().claimStale(old.id)).resolves.toMatchObject({
        key: "old",
        status: "purging",
        uploadToken: "t-old",
      });
      await expect(store().claimStale(old.id)).resolves.toBeNull();
      await expect(
        store().markActive({
          bucket: "b",
          key: "old",
          uploadToken: "t-old",
          size: 1,
        }),
      ).rejects.toMatchObject({ code: "OBJECT_NOT_FOUND" });

      await store().deletePurged(old.id);
      await expect(
        store().find({ bucket: "b", key: "old" }),
      ).resolves.toBeNull();
    });

    it("gives concurrent claims of a row to one caller", async () => {
      await seed();
      const old = await store().find({ bucket: "b", key: "old" });
      if (!old) throw new Error("expected the stale row");

      const claims = await Promise.all([
        store().claimStale(old.id),
        store().claimStale(old.id),
      ]);
      expect(claims.filter((claim) => claim !== null)).toHaveLength(1);
    });

    it("claims an expired overwrite and keeps the object listed", async () => {
      await seed();
      const overwrite = await store().find({ bucket: "b", key: "overwrite" });
      if (!overwrite) throw new Error("expected the overwrite");

      await expect(store().claimStale(overwrite.id)).resolves.toMatchObject({
        status: "active",
        uploadToken: "t-over",
        updatedAt: overwrite.updatedAt,
      });
      await expect(store().claimStale(overwrite.id)).resolves.toBeNull();
      await expect(store().count({ scope: "user:1" })).resolves.toBe(3);
    });

    it("makes a claimed row stale again once the claim lapses", async () => {
      await seed();
      const old = await store().find({ bucket: "b", key: "old" });
      if (!old) throw new Error("expected the stale row");
      const claimedAt = Date.now();
      const claimed = await store().claimStale(old.id);
      const deadline = claimed?.expiresAt?.getTime() ?? 0;
      expect(deadline).toBeGreaterThanOrEqual(claimedAt + PURGE_CLAIM_MS);

      await expect(keys()).resolves.toEqual(["overwrite", "stuck"]);
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(deadline + MINUTE);
      // It queues behind every row that expired before the claim.
      await expect(keys()).resolves.toEqual([
        "overwrite",
        "stuck",
        "live",
        "overwriting",
        "old",
      ]);
      await expect(store().claimStale(old.id)).resolves.toMatchObject({
        status: "purging",
      });
    });

    it("does not claim a live or confirmed row", async () => {
      await seed();
      for (const key of ["live", "active", "overwriting"]) {
        const row = await store().find({ bucket: "b", key });
        await expect(store().claimStale(row?.id ?? "")).resolves.toBeNull();
      }
      await expect(store().claimStale("missing")).resolves.toBeNull();
    });

    it("keeps a new upload off the key until the claimed row is gone", async () => {
      await seed();
      const old = await store().find({ bucket: "b", key: "old" });
      if (!old) throw new Error("expected the stale row");
      await store().claimStale(old.id);
      const upload = pending({ key: "old", uploadToken: "t-new" });

      await expect(store().upsertPending(upload)).rejects.toMatchObject({
        code: "CONFLICT",
      });
      await store().deletePurged(old.id);
      await expect(store().upsertPending(upload)).resolves.toMatchObject({
        status: "pending",
        uploadToken: "t-new",
      });
    });

    it("prunes deleted rows older than the cutoff", async () => {
      const day = 24 * 60 * MINUTE;
      await insertObject(client(), {
        key: "older",
        status: "deleted",
        deletedAt: new Date(Date.now() - 10 * day),
      });
      await insertObject(client(), {
        key: "recent",
        status: "deleted",
        deletedAt: new Date(),
      });
      await insertObject(client(), { key: "kept" });

      const cutoff = new Date(Date.now() - day);
      await expect(store().pruneDeleted(cutoff)).resolves.toBe(1);
      await expect(store().pruneDeleted(cutoff)).resolves.toBe(0);
      await expect(
        store().count({ scope: "user:1", status: "deleted" }),
      ).resolves.toBe(1);
      await expect(store().count({ scope: "user:1" })).resolves.toBe(1);
    });
  });
});
