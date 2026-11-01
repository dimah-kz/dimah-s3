import {
  AbortMultipartUploadCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  S3ServiceException,
  type S3Client,
} from "@aws-sdk/client-s3";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDbStore } from "@/store/create-db-store";
import { insertObject } from "@/test/databases";
import { memoryDbClient } from "@/test/fakes";
import type { StorageObject } from "@/types/storage-object";
import { createPurge } from "./purge";

const MINUTE = 60_000;
const aMinuteAgo = () => new Date(Date.now() - MINUTE);
const inAMinute = () => new Date(Date.now() + MINUTE);

function s3Exception(name: string, httpStatusCode: number) {
  return new S3ServiceException({
    name,
    $fault: "client",
    $metadata: { httpStatusCode },
    message: name,
  });
}

/**
 * An S3 client whose HeadObject returns `head` (or throws it), and whose
 * DeleteObject runs `remove`.
 */
function s3({
  head = { Metadata: { "dimah-upload": "t1" }, ETag: '"e1"' },
  remove = () => ({}),
  abort = () => ({}),
}: {
  head?: object | Error;
  remove?: (command: DeleteObjectCommand) => object;
  abort?: () => object;
} = {}) {
  const send = vi.fn(async (command: unknown) => {
    if (command instanceof HeadObjectCommand) {
      if (head instanceof Error) throw head;
      return head;
    }
    if (command instanceof DeleteObjectCommand) return remove(command);
    if (command instanceof AbortMultipartUploadCommand) return abort();
    throw new Error("unexpected command");
  });
  return { client: { send } as unknown as S3Client, send };
}

function commandsOf(send: ReturnType<typeof s3>["send"]) {
  return send.mock.calls.map(([command]) => command);
}

function setup(client?: S3Client) {
  const database = memoryDbClient();
  const { objects } = createDbStore(database);
  const logger = { warn: vi.fn() };
  const purge = createPurge({
    objects,
    client: () => client,
    logger: () => logger,
  });
  const stale = (key: string, values: Partial<StorageObject<unknown>> = {}) =>
    insertObject(database, {
      status: "pending",
      uploadToken: "t1",
      expiresAt: aMinuteAgo(),
      ...values,
      key,
    });
  return { objects, purge, logger, stale };
}

describe("createPurge", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe("purgeStale", () => {
    it("deletes the object and the row of an expired upload", async () => {
      const { client, send } = s3();
      const { objects, purge, stale } = setup(client);
      await stale("k");

      await expect(purge.purgeStale()).resolves.toMatchObject({ purged: 1 });
      const [head, remove] = commandsOf(send);
      expect(head).toBeInstanceOf(HeadObjectCommand);
      expect(remove).toBeInstanceOf(DeleteObjectCommand);
      expect((remove as DeleteObjectCommand).input).toEqual({
        Bucket: "b",
        Key: "k",
        IfMatch: '"e1"',
      });
      await expect(objects.find({ bucket: "b", key: "k" })).resolves.toBeNull();
    });

    it("keeps an object that another upload wrote", async () => {
      const { client, send } = s3({
        head: { Metadata: { "dimah-upload": "t2" }, ETag: '"e2"' },
      });
      const { objects, purge, stale } = setup(client);
      await stale("k");

      await expect(purge.purgeStale()).resolves.toMatchObject({ purged: 1 });
      expect(commandsOf(send)).toEqual([expect.any(HeadObjectCommand)]);
      await expect(objects.find({ bucket: "b", key: "k" })).resolves.toBeNull();
    });

    it("keeps a row confirmed before the claim", async () => {
      const { client, send } = s3();
      const { objects, purge, stale } = setup(client);
      await stale("k");
      const findStale = objects.findStale;
      vi.spyOn(objects, "findStale").mockImplementation(async (options) => {
        const rows = await findStale(options);
        // The upload is confirmed between the listing and the claim.
        await objects.markActive({
          bucket: "b",
          key: "k",
          uploadToken: "t1",
          size: 10,
        });
        return rows;
      });

      await expect(purge.purgeStale()).resolves.toMatchObject({ purged: 0 });
      expect(send).not.toHaveBeenCalled();
      await expect(
        objects.find({ bucket: "b", key: "k" }),
      ).resolves.toMatchObject({ status: "active" });
    });

    it("blocks a confirm once the row is claimed", async () => {
      const { client } = s3();
      const { objects, purge, stale } = setup(client);
      await stale("k");
      const claimStale = objects.claimStale;
      const confirm = vi.fn(() =>
        objects.markActive({
          bucket: "b",
          key: "k",
          uploadToken: "t1",
          size: 10,
        }),
      );
      vi.spyOn(objects, "claimStale").mockImplementation(async (id) => {
        const row = await claimStale(id);
        await expect(confirm()).rejects.toMatchObject({
          code: "OBJECT_NOT_FOUND",
        });
        return row;
      });

      await expect(purge.purgeStale()).resolves.toMatchObject({ purged: 1 });
      expect(confirm).toHaveBeenCalledTimes(1);
    });

    it("leaves live rows alone", async () => {
      const { client, send } = s3();
      const { purge, stale } = setup(client);
      await stale("pending", { expiresAt: inAMinute() });
      await stale("active", { status: "active", expiresAt: null });
      await stale("overwriting", { status: "active", expiresAt: inAMinute() });

      await expect(purge.purgeStale()).resolves.toMatchObject({ purged: 0 });
      expect(send).not.toHaveBeenCalled();
    });

    it("aborts a multipart upload, then checks for a completed object", async () => {
      const { client, send } = s3({ head: s3Exception("NotFound", 404) });
      const { purge, stale } = setup(client);
      await stale("k", { uploadId: "up-1" });

      await expect(purge.purgeStale()).resolves.toMatchObject({ purged: 1 });
      const [abort, head] = commandsOf(send);
      expect((abort as AbortMultipartUploadCommand).input).toEqual({
        Bucket: "b",
        Key: "k",
        UploadId: "up-1",
      });
      expect(head).toBeInstanceOf(HeadObjectCommand);
    });

    it("treats an upload that is already gone as purged", async () => {
      const { client } = s3({
        head: s3Exception("NotFound", 404),
        abort: () => {
          throw s3Exception("NoSuchUpload", 404);
        },
      });
      const { purge, stale } = setup(client);
      await stale("k", { uploadId: "up-1" });

      await expect(purge.purgeStale()).resolves.toMatchObject({ purged: 1 });
    });

    it("skips the delete when the object changed after HeadObject", async () => {
      const { client } = s3({
        remove: () => {
          throw s3Exception("PreconditionFailed", 412);
        },
      });
      const { objects, purge, stale } = setup(client);
      await stale("k");

      await expect(purge.purgeStale()).resolves.toMatchObject({ purged: 1 });
      await expect(objects.find({ bucket: "b", key: "k" })).resolves.toBeNull();
    });

    it("deletes without If-Match where the provider does not implement it", async () => {
      const remove = vi.fn((command: DeleteObjectCommand) => {
        if (command.input.IfMatch) throw s3Exception("NotImplemented", 501);
        return {};
      });
      const { client } = s3({ remove });
      const { purge, stale } = setup(client);
      await stale("k");

      await expect(purge.purgeStale()).resolves.toMatchObject({ purged: 1 });
      expect(remove).toHaveBeenCalledTimes(2);
      expect(remove.mock.calls[1]?.[0].input).toEqual({
        Bucket: "b",
        Key: "k",
      });
    });

    it("keeps a row whose S3 cleanup fails until its claim lapses", async () => {
      const { client } = s3({ head: s3Exception("SlowDown", 503) });
      const { objects, purge, logger, stale } = setup(client);
      await stale("k");

      await expect(purge.purgeStale()).resolves.toMatchObject({ purged: 0 });
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("b/k"),
        expect.any(S3ServiceException),
      );
      const row = await objects.find({ bucket: "b", key: "k" });
      expect(row).toMatchObject({ status: "purging" });
      await expect(objects.findStale()).resolves.toEqual([]);

      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime((row?.expiresAt?.getTime() ?? 0) + MINUTE);
      await expect(objects.findStale()).resolves.toHaveLength(1);
    });

    it("reaches new stale rows while failing rows wait out their claim", async () => {
      const head = vi.fn(async (key: string) => {
        if (key === "fresh") return { Metadata: {} };
        throw s3Exception("AccessDenied", 403);
      });
      const send = vi.fn(async (command: unknown) => {
        if (command instanceof HeadObjectCommand) {
          return head(command.input.Key ?? "");
        }
        throw new Error("unexpected command");
      });
      const { objects, purge, stale } = setup({ send } as unknown as S3Client);
      const old = new Date(Date.now() - 10 * MINUTE);
      await stale("a", { expiresAt: old });
      await stale("b", { expiresAt: old });
      await stale("fresh");

      await expect(purge.purgeStale({ limit: 2 })).resolves.toEqual({
        purged: 0,
        failed: 2,
        skipped: 0,
        more: true,
      });
      await expect(purge.purgeStale({ limit: 2 })).resolves.toEqual({
        purged: 1,
        failed: 0,
        skipped: 0,
        more: false,
      });
      await expect(
        objects.find({ bucket: "b", key: "fresh" }),
      ).resolves.toBeNull();
    });

    describe("an expired overwrite", () => {
      const overwrite = (values: Partial<StorageObject<unknown>> = {}) => ({
        status: "active" as const,
        size: 5,
        eTag: '"e0"',
        ...values,
      });

      it("keeps the previous object and its row", async () => {
        const { client, send } = s3({
          head: { Metadata: { "dimah-upload": "t0" }, ETag: '"e0"' },
        });
        const { objects, purge, stale } = setup(client);
        await stale("k", overwrite({ uploadId: "up-1" }));

        await expect(purge.purgeStale()).resolves.toMatchObject({ purged: 1 });
        expect(commandsOf(send)).toEqual([
          expect.any(AbortMultipartUploadCommand),
          expect.any(HeadObjectCommand),
        ]);
        await expect(
          objects.find({ bucket: "b", key: "k" }),
        ).resolves.toMatchObject({
          status: "active",
          size: 5,
          uploadId: null,
          uploadToken: null,
          expiresAt: null,
        });
        await expect(objects.findStale()).resolves.toEqual([]);
      });

      it("deletes the overwrite's unconfirmed object and the row", async () => {
        const { client, send } = s3();
        const { objects, purge, stale } = setup(client);
        await stale("k", overwrite());

        await expect(purge.purgeStale()).resolves.toMatchObject({ purged: 1 });
        expect(commandsOf(send)).toEqual([
          expect.any(HeadObjectCommand),
          expect.any(DeleteObjectCommand),
        ]);
        await expect(
          objects.find({ bucket: "b", key: "k" }),
        ).resolves.toBeNull();
      });

      it("blocks the overwrite's confirm once claimed, and drops its object and row", async () => {
        const { client, send } = s3();
        const { objects, purge, stale } = setup(client);
        await stale("k", overwrite());
        const claimStale = objects.claimStale;
        const confirm = vi.fn(() =>
          objects.markActive({
            bucket: "b",
            key: "k",
            uploadToken: "t1",
            size: 10,
          }),
        );
        vi.spyOn(objects, "claimStale").mockImplementation(async (id) => {
          const row = await claimStale(id);
          // The confirm lands after the claim, inside its ticket's last second.
          await expect(confirm()).rejects.toMatchObject({
            code: "OBJECT_NOT_FOUND",
          });
          return row;
        });

        await expect(purge.purgeStale()).resolves.toMatchObject({ purged: 1 });
        expect(confirm).toHaveBeenCalledTimes(1);
        // The S3 marker carries the upload's own token, not the claim's.
        expect(commandsOf(send)).toEqual([
          expect.any(HeadObjectCommand),
          expect.any(DeleteObjectCommand),
        ]);
        await expect(
          objects.find({ bucket: "b", key: "k" }),
        ).resolves.toBeNull();
      });

      it("drops the row when the object is gone", async () => {
        const { client } = s3({ head: s3Exception("NotFound", 404) });
        const { objects, purge, stale } = setup(client);
        await stale("k", overwrite());

        await expect(purge.purgeStale()).resolves.toMatchObject({ purged: 1 });
        await expect(
          objects.find({ bucket: "b", key: "k" }),
        ).resolves.toBeNull();
      });

      it("fails, and keeps, the row of a route without an S3 client", async () => {
        const { objects, purge, stale } = setup();
        await stale("k", overwrite());

        // Dropping the row would leave its object untracked in the bucket.
        await expect(purge.purgeStale()).resolves.toMatchObject({
          purged: 0,
          failed: 1,
        });
        await expect(
          objects.find({ bucket: "b", key: "k" }),
        ).resolves.toMatchObject({ status: "active" });
      });
    });

    it("handles at most `limit` rows per run", async () => {
      const { client } = s3();
      const { purge, stale } = setup(client);
      await stale("a");
      await stale("b");
      await stale("c");

      await expect(purge.purgeStale({ limit: 2 })).resolves.toEqual({
        purged: 2,
        failed: 0,
        skipped: 0,
        more: true,
      });
      await expect(purge.purgeStale({ limit: 2 })).resolves.toEqual({
        purged: 1,
        failed: 0,
        skipped: 0,
        more: false,
      });
    });
  });

  describe("pruneDeleted", () => {
    it("removes rows deleted before the cutoff", async () => {
      const database = memoryDbClient();
      const { objects } = createDbStore(database);
      const purge = createPurge({
        objects,
        client: () => undefined,
        logger: () => undefined,
      });
      const old = new Date("2024-01-01T00:00:00.000Z");
      await insertObject(database, {
        key: "old",
        status: "deleted",
        deletedAt: old,
      });
      await insertObject(database, {
        key: "recent",
        status: "deleted",
        deletedAt: new Date(),
      });

      await expect(
        purge.pruneDeleted({ olderThan: old.getTime() + 1 }),
      ).resolves.toEqual({ pruned: 1 });
      await expect(
        purge.pruneDeleted({ olderThan: new Date(Date.now() + MINUTE) }),
      ).resolves.toEqual({ pruned: 1 });
      await expect(
        objects.find({ bucket: "b", key: "recent" }),
      ).resolves.toBeNull();
    });
  });
});
