import { AbortMultipartUploadCommand, type S3Client } from "@aws-sdk/client-s3";
import type {
  DeleteOnDeletedContext,
  MultipartGuardContext,
  ObjectContext,
  S3Operation,
  UploadConfirmGuardContext,
  UploadOnConfirmedContext,
  UploadOnStartContext,
} from "@dimah-s3/server";
import { describe, expect, it, vi } from "vitest";
import { createDbStore } from "@/store/create-db-store";
import { insertObject } from "@/test/databases";
import { memoryDbClient } from "@/test/fakes";
import type { DbClientObject } from "@/types/client";
import type { DbPluginOptions, ScopeContext } from "@/types/plugin";
import type { StorageObject } from "@/types/storage-object";
import { createDatabaseLifecycleHooks } from "./create-database-lifecycle-hooks";
import { createObjectAccess } from "./object-access";
import { createQuota } from "./quota";
import { createScopeResolver } from "./scope";
import { toDbClientObject } from "./to-db-client-object";

const MINUTE = 60_000;
const ref = { bucket: "b", key: "k" };

type SetupOptions = Partial<
  Pick<DbPluginOptions, "resolveScope" | "authorize" | "quota" | "deleteMode">
> & {
  replace?: "overwrite";
  tracked?: boolean;
  client?: S3Client;
};

function setup(options: SetupOptions = {}) {
  const database = memoryDbClient();
  const store = createDbStore(database);
  const resolveScope = createScopeResolver({
    resolveScope: options.resolveScope ?? (() => "user:1"),
  });
  const hooks = createDatabaseLifecycleHooks({
    store,
    resolveScope,
    access: createObjectAccess({
      objects: store.objects,
      resolveScope,
      authorize: options.authorize,
      toClientObject: toDbClientObject,
    }),
    quota: createQuota(store.objects, options.quota),
    deleteMode: options.deleteMode,
    routes: {
      tracked: () => options.tracked ?? true,
      replace: () => options.replace,
      client: () => options.client,
    },
  });
  const insert = (values: Partial<StorageObject<unknown>> = {}) =>
    insertObject(database, { key: "k", ...values });
  const row = () => store.objects.find(ref);
  return { hooks, store, insert, row };
}

/** The hook, which these tests expect the plugin to define. */
function defined<T>(hook: T | undefined): T {
  if (hook === undefined) throw new Error("hook is not defined");
  return hook;
}

function objectContext(operation: S3Operation): ObjectContext {
  return {
    request: new Request("http://localhost/api/s3"),
    operation,
    locals: {},
    route: "uploads",
    ...ref,
  };
}

function startContext(
  overrides: Partial<UploadOnStartContext> = {},
): UploadOnStartContext {
  return {
    ...objectContext("upload"),
    kind: "put",
    file: { name: "a.txt", size: 10, type: "text/plain" },
    acl: "private",
    uploadToken: "t1",
    expiresAt: new Date(Date.now() + MINUTE),
    ...overrides,
  };
}

function confirmContext(
  overrides: Partial<UploadConfirmGuardContext> = {},
): UploadConfirmGuardContext {
  return {
    ...objectContext("confirm"),
    kind: "put",
    uploadToken: "t1",
    file: { name: "a.txt", size: 10, type: "text/plain" },
    ...overrides,
  };
}

function confirmedContext(
  overrides: Partial<UploadOnConfirmedContext> = {},
): UploadOnConfirmedContext {
  return {
    ...objectContext("confirm"),
    kind: "put",
    uploadToken: "t1",
    acl: "private",
    object: {
      name: "a.txt",
      size: 12,
      type: "text/plain",
      eTag: '"e1"',
      metadata: { source: "web" },
    },
    ...overrides,
  };
}

function multipartContext(
  action: "part" | "list" | "abort" | "complete",
): MultipartGuardContext {
  const base = {
    ...objectContext("multipart.signPart"),
    uploadId: "up-1",
    uploadToken: "t1",
    file: { name: "a.bin", size: 100 },
  };
  return action === "part"
    ? { ...base, action, partNumber: 1, size: 100 }
    : { ...base, action };
}

/** A pending row of upload `t1`, as `onStart` writes it. */
const pendingRow = {
  status: "pending",
  uploadToken: "t1",
  expiresAt: new Date(Date.now() + MINUTE),
} as const;

/** An active row that upload `t1` is overwriting, as `onStart` leaves it. */
const overwrittenRow = {
  status: "active",
  size: 5,
  uploadToken: "t1",
  expiresAt: new Date(Date.now() + MINUTE),
} as const;

describe("createDatabaseLifecycleHooks", () => {
  describe("ticketSubject", () => {
    it("binds tickets to the scope", async () => {
      const resolveScope = vi.fn(
        ({ operation }: ScopeContext) => `user:1:${operation}`,
      );
      const { hooks } = setup({ resolveScope });
      const subject = defined(hooks.ticketSubject);

      await expect(subject(objectContext("upload"))).resolves.toBe(
        "user:1:upload",
      );
      await expect(subject(objectContext("multipart.complete"))).resolves.toBe(
        "user:1:multipart",
      );
      expect(resolveScope).toHaveBeenCalledWith(
        expect.objectContaining({ operation: "upload", route: "uploads" }),
      );
    });

    it("leaves tickets unbound on an untracked route", async () => {
      const resolveScope = vi.fn(() => "user:1");
      const { hooks } = setup({ resolveScope, tracked: false });

      await expect(
        defined(hooks.ticketSubject)(objectContext("confirm")),
      ).resolves.toBeUndefined();
      expect(resolveScope).not.toHaveBeenCalled();
    });

    it("rejects a call without a scope", async () => {
      const { hooks } = setup({ resolveScope: () => null });

      await expect(
        defined(hooks.ticketSubject)(objectContext("confirm")),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });
  });

  describe("upload.guard", () => {
    it("rejects a call without a scope", async () => {
      const { hooks } = setup({ resolveScope: () => null });

      await expect(
        defined(hooks.upload?.guard)(startContext()),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });

    it("rejects an invalid folder", async () => {
      const { hooks } = setup();

      await expect(
        defined(hooks.upload?.guard)(
          startContext({ clientMetadata: { folder: "docs/../q4" } }),
        ),
      ).rejects.toMatchObject({ code: "FOLDER_INVALID" });
    });

    it("authorizes the upload into its folder", async () => {
      const authorize = vi.fn(({ folder }: ScopeContext) => folder !== "x");
      const { hooks } = setup({ authorize });
      const guard = defined(hooks.upload?.guard);

      await guard(startContext({ clientMetadata: { folder: "docs" } }));
      expect(authorize).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: "upload",
          scope: "user:1",
          key: "k",
          folder: "docs",
          clientMetadata: { folder: "docs" },
        }),
      );
      await expect(
        guard(startContext({ clientMetadata: { folder: "x" } })),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("rejects a key another scope holds", async () => {
      const { hooks, insert } = setup();
      await insert({ scope: "user:2", status: "pending" });

      await expect(
        defined(hooks.upload?.guard)(startContext()),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("lets another scope reuse a deleted key", async () => {
      const { hooks, insert } = setup();
      await insert({ scope: "user:2", status: "deleted" });

      await expect(
        defined(hooks.upload?.guard)(startContext()),
      ).resolves.toBeUndefined();
    });

    it("rejects replacing an active object unless the route overwrites", async () => {
      const blocked = setup();
      await blocked.insert();
      await expect(
        defined(blocked.hooks.upload?.guard)(startContext()),
      ).rejects.toMatchObject({ code: "CONFLICT" });

      const overwrite = setup({ replace: "overwrite" });
      await overwrite.insert();
      await expect(
        defined(overwrite.hooks.upload?.guard)(startContext()),
      ).resolves.toBeUndefined();
    });

    it("authorizes an overwrite with the object it replaces, in its folder", async () => {
      const authorize = vi.fn(
        ({ object }: ScopeContext & { object?: DbClientObject<never> }) =>
          object?.folder !== "locked",
      );
      const { hooks, insert } = setup({ authorize, replace: "overwrite" });
      await insert({ folder: "locked", size: 5 });

      await expect(
        defined(hooks.upload?.guard)(
          startContext({ clientMetadata: { folder: "docs" } }),
        ),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(authorize).toHaveBeenCalledTimes(1);
      expect(authorize).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: "upload",
          key: "k",
          folder: "locked",
          object: expect.objectContaining({ key: "k", folder: "locked" }),
        }),
      );
    });

    it("rejects an overwrite of another scope's object before authorize", async () => {
      const authorize = vi.fn(() => true);
      const { hooks, insert } = setup({ authorize, replace: "overwrite" });
      await insert({ scope: "user:2" });

      await expect(
        defined(hooks.upload?.guard)(startContext()),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(authorize).not.toHaveBeenCalled();
    });

    it("rejects a key that purge is cleaning up", async () => {
      const { hooks, insert } = setup({ replace: "overwrite" });
      await insert({ ...pendingRow, status: "purging" });

      await expect(
        defined(hooks.upload?.guard)(startContext()),
      ).rejects.toMatchObject({ code: "CONFLICT" });
    });

    it("rejects an upload past the quota", async () => {
      const { hooks, insert } = setup({ quota: { maxBytes: 15, maxFiles: 2 } });
      await insert({ key: "other", size: 10 });
      const guard = defined(hooks.upload?.guard);

      await expect(
        guard(startContext({ file: { name: "a.txt", size: 6 } })),
      ).rejects.toMatchObject({
        code: "QUOTA_EXCEEDED",
        params: { limit: "bytes" },
      });
      await insert({ key: "third", size: 1 });
      await expect(
        guard(startContext({ file: { name: "a.txt", size: 1 } })),
      ).rejects.toMatchObject({
        code: "QUOTA_EXCEEDED",
        params: { limit: "files" },
      });
    });

    it("leaves the replaced object out of the quota", async () => {
      const { hooks, insert } = setup({
        quota: { maxBytes: 15, maxFiles: 1 },
        replace: "overwrite",
      });
      await insert({ size: 10 });

      await expect(
        defined(hooks.upload?.guard)(
          startContext({ file: { name: "a.txt", size: 15 } }),
        ),
      ).resolves.toBeUndefined();
    });
  });

  describe("upload.onStart", () => {
    it("writes a pending row that expires with the ticket", async () => {
      const { hooks, row } = setup();
      const expiresAt = new Date(Date.now() + 5 * MINUTE);

      await defined(hooks.upload?.onStart)(
        startContext({ expiresAt, uploadId: "up-1" }),
      );
      await expect(row()).resolves.toMatchObject({
        scope: "user:1",
        route: "uploads",
        status: "pending",
        folder: null,
        filename: "a.txt",
        contentType: "text/plain",
        declaredSize: 10,
        acl: "private",
        uploadId: "up-1",
        uploadToken: "t1",
        expiresAt,
      });
    });

    it("creates the folder and its ancestors", async () => {
      const { hooks, store, row } = setup();

      await defined(hooks.upload?.onStart)(
        startContext({ clientMetadata: { folder: "docs/q4" } }),
      );
      await expect(row()).resolves.toMatchObject({ folder: "docs/q4" });
      await expect(store.folders.find("user:1", "docs")).resolves.toMatchObject(
        { path: "docs", parent: null },
      );
      await expect(
        store.folders.find("user:1", "docs/q4"),
      ).resolves.toMatchObject({ parent: "docs" });
    });

    it("rejects an active object at the key unless the route overwrites", async () => {
      const blocked = setup();
      await blocked.insert({ uploadToken: "t0" });
      await expect(
        defined(blocked.hooks.upload?.onStart)(
          startContext({ clientMetadata: { folder: "docs" } }),
        ),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      // The folder is written only after the row.
      await expect(
        blocked.store.folders.find("user:1", "docs"),
      ).resolves.toBeNull();

      const overwrite = setup({ replace: "overwrite" });
      await overwrite.insert({ uploadToken: "t0", folder: "avatars", size: 5 });
      await defined(overwrite.hooks.upload?.onStart)(
        startContext({ clientMetadata: { folder: "docs" } }),
      );
      await expect(overwrite.row()).resolves.toMatchObject({
        status: "active",
        folder: "avatars",
        size: 5,
        uploadToken: "t1",
        declaredSize: 10,
      });
      await expect(
        overwrite.store.folders.find("user:1", "avatars"),
      ).resolves.toMatchObject({ path: "avatars" });
      await expect(
        overwrite.store.folders.find("user:1", "docs"),
      ).resolves.toBeNull();
    });

    it("shares one scope lookup with the guard of the same call", async () => {
      const resolveScope = vi.fn(() => "user:1");
      const { hooks } = setup({ resolveScope });
      const context = startContext({ clientMetadata: { folder: "docs" } });

      await defined(hooks.upload?.guard)(context);
      await defined(hooks.upload?.onStart)(context);
      expect(resolveScope).toHaveBeenCalledTimes(1);
    });
  });

  describe("upload.confirmGuard", () => {
    it("accepts the pending row of the ticket's upload", async () => {
      const { hooks, insert } = setup();
      await insert(pendingRow);

      await expect(
        defined(hooks.upload?.confirmGuard)(confirmContext()),
      ).resolves.toBeUndefined();
    });

    it("accepts the active row the ticket's upload overwrites", async () => {
      const { hooks, insert } = setup();
      await insert(overwrittenRow);

      await expect(
        defined(hooks.upload?.confirmGuard)(confirmContext()),
      ).resolves.toBeUndefined();
    });

    it("accepts a confirmed row again for a retried confirm", async () => {
      const { hooks, insert } = setup();
      await insert({ uploadToken: "t1" });

      await expect(
        defined(hooks.upload?.confirmGuard)(confirmContext()),
      ).resolves.toBeUndefined();
    });

    it.each([
      ["missing", undefined],
      ["deleted", { status: "deleted" }],
      ["purging", { ...pendingRow, status: "purging" }],
      ["another upload's", { ...pendingRow, uploadToken: "t2" }],
    ] as const)("rejects a %s row", async (_name, values) => {
      const { hooks, insert } = setup();
      if (values) await insert(values);

      await expect(
        defined(hooks.upload?.confirmGuard)(confirmContext()),
      ).rejects.toMatchObject({ code: "OBJECT_NOT_FOUND" });
    });

    it("rejects a row of another scope", async () => {
      const { hooks, insert } = setup();
      await insert({ ...pendingRow, scope: "user:2" });

      await expect(
        defined(hooks.upload?.confirmGuard)(confirmContext()),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("runs authorize with the row", async () => {
      const authorize = vi.fn(() => false);
      const { hooks, insert } = setup({ authorize });
      await insert(pendingRow);

      await expect(
        defined(hooks.upload?.confirmGuard)(confirmContext()),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(authorize).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: "confirm",
          object: expect.objectContaining({ key: "k", status: "pending" }),
        }),
      );
    });
  });

  describe("upload.onConfirmed", () => {
    it("marks the row active with the verified object", async () => {
      const { hooks, insert, row } = setup();
      await insert({ ...pendingRow, declaredSize: 10 });

      await defined(hooks.upload?.onConfirmed)(confirmedContext());
      await expect(row()).resolves.toMatchObject({
        status: "active",
        size: 12,
        declaredSize: null,
        eTag: '"e1"',
        contentType: "text/plain",
        s3Metadata: { source: "web" },
        expiresAt: null,
        uploadToken: "t1",
      });
    });

    it("keeps the stored row on a replay, without a quota check", async () => {
      const { hooks, insert, row } = setup({ quota: { maxFiles: 1 } });
      await insert({ ...pendingRow, declaredSize: 10 });
      const onConfirmed = defined(hooks.upload?.onConfirmed);
      await onConfirmed(confirmedContext());
      const stored = await row();
      // The scope is full now, which a replay must not notice.
      await insert({ key: "other" });

      await onConfirmed(confirmedContext({ request: new Request("http://x") }));
      await expect(row()).resolves.toEqual(stored);
    });

    it("rejects a row that purge has claimed", async () => {
      const { hooks, insert, row } = setup();
      await insert({ ...pendingRow, status: "purging" });

      await expect(
        defined(hooks.upload?.onConfirmed)(confirmedContext()),
      ).rejects.toMatchObject({ code: "OBJECT_NOT_FOUND" });
      await expect(row()).resolves.toMatchObject({ status: "purging" });
    });

    it("rejects an overwrite that purge has claimed", async () => {
      const { hooks, store, insert, row } = setup({ replace: "overwrite" });
      const stored = await insert({
        ...overwrittenRow,
        expiresAt: new Date(Date.now() - MINUTE),
      });
      await store.objects.claimStale(stored.id);

      await expect(
        defined(hooks.upload?.confirmGuard)(confirmContext()),
      ).rejects.toMatchObject({ code: "OBJECT_NOT_FOUND" });
      await expect(
        defined(hooks.upload?.onConfirmed)(confirmedContext()),
      ).rejects.toMatchObject({ code: "OBJECT_NOT_FOUND" });
      await expect(row()).resolves.toMatchObject({
        status: "active",
        size: 5,
        uploadToken: "purge:t1",
      });
    });

    it("checks the quota against the verified size and drops the row", async () => {
      const { hooks, insert, row } = setup({ quota: { maxBytes: 20 } });
      await insert({ key: "other", size: 10 });
      await insert({ ...pendingRow, declaredSize: 10 });

      await expect(
        defined(hooks.upload?.onConfirmed)(
          confirmedContext({
            object: { size: 11, metadata: {} },
          }),
        ),
      ).rejects.toMatchObject({
        code: "QUOTA_EXCEEDED",
        params: { limit: "bytes" },
      });
      await expect(row()).resolves.toBeNull();
    });

    it("confirms an overwrite in place and quota-checks it without the old size", async () => {
      const { hooks, insert, row } = setup({ quota: { maxBytes: 12 } });
      await insert({ ...overwrittenRow, folder: "avatars", size: 10 });

      await defined(hooks.upload?.onConfirmed)(confirmedContext());
      await expect(row()).resolves.toMatchObject({
        status: "active",
        folder: "avatars",
        size: 12,
        expiresAt: null,
        uploadToken: "t1",
      });
    });

    it("drops an overwritten row when the verified size breaks the quota", async () => {
      const { hooks, insert, row } = setup({ quota: { maxBytes: 11 } });
      await insert(overwrittenRow);

      // The server deletes the overwrite's object, which already replaced the old one.
      await expect(
        defined(hooks.upload?.onConfirmed)(confirmedContext()),
      ).rejects.toMatchObject({ code: "QUOTA_EXCEEDED" });
      await expect(row()).resolves.toBeNull();
    });
  });

  describe("upload.multipart.guard", () => {
    it("accepts parts and listings of the pending upload", async () => {
      const { hooks, insert } = setup();
      await insert({ ...pendingRow, uploadId: "up-1" });
      const guard = defined(hooks.upload?.multipart?.guard);

      await expect(guard(multipartContext("part"))).resolves.toBeUndefined();
      await expect(guard(multipartContext("list"))).resolves.toBeUndefined();
      await expect(
        guard(multipartContext("complete")),
      ).resolves.toBeUndefined();
    });

    it("accepts parts of an overwrite in flight", async () => {
      const { hooks, insert } = setup();
      await insert({ ...overwrittenRow, uploadId: "up-1" });

      await expect(
        defined(hooks.upload?.multipart?.guard)(multipartContext("part")),
      ).resolves.toBeUndefined();
    });

    it("accepts only a retried complete once the upload is confirmed", async () => {
      const { hooks, insert } = setup();
      await insert({ uploadToken: "t1" });
      const guard = defined(hooks.upload?.multipart?.guard);

      await expect(
        guard(multipartContext("complete")),
      ).resolves.toBeUndefined();
      await expect(guard(multipartContext("part"))).rejects.toMatchObject({
        code: "OBJECT_NOT_FOUND",
      });
    });

    it("rejects a session of another scope or upload", async () => {
      const foreign = setup();
      await foreign.insert({ ...pendingRow, scope: "user:2" });
      const guard = defined(foreign.hooks.upload?.multipart?.guard);
      for (const action of ["part", "list", "complete", "abort"] as const) {
        await expect(guard(multipartContext(action))).rejects.toMatchObject({
          code: "FORBIDDEN",
        });
      }

      const replaced = setup();
      await replaced.insert({ ...pendingRow, uploadToken: "t2" });
      await expect(
        defined(replaced.hooks.upload?.multipart?.guard)(
          multipartContext("part"),
        ),
      ).rejects.toMatchObject({ code: "OBJECT_NOT_FOUND" });
    });

    it("lets an upload whose row is gone or replaced be aborted", async () => {
      const gone = setup();
      await expect(
        defined(gone.hooks.upload?.multipart?.guard)(multipartContext("abort")),
      ).resolves.toBeUndefined();

      const replaced = setup();
      await replaced.insert({ ...pendingRow, uploadToken: "t2" });
      await expect(
        defined(replaced.hooks.upload?.multipart?.guard)(
          multipartContext("abort"),
        ),
      ).resolves.toBeUndefined();
    });
  });

  describe("upload.multipart.onAbort", () => {
    it("drops the pending row of the aborted upload only", async () => {
      const own = setup();
      await own.insert({ ...pendingRow, uploadId: "up-1" });
      await defined(own.hooks.upload?.multipart?.onAbort)(
        multipartContext("abort"),
      );
      await expect(own.row()).resolves.toBeNull();

      const replaced = setup();
      await replaced.insert({ ...pendingRow, uploadToken: "t2" });
      await defined(replaced.hooks.upload?.multipart?.onAbort)(
        multipartContext("abort"),
      );
      await expect(replaced.row()).resolves.toMatchObject({
        uploadToken: "t2",
      });
    });

    it("keeps the active row an aborted overwrite was replacing", async () => {
      const { hooks, insert, row } = setup();
      await insert({ ...overwrittenRow, uploadId: "up-1" });

      await defined(hooks.upload?.multipart?.onAbort)(
        multipartContext("abort"),
      );
      await expect(row()).resolves.toMatchObject({
        status: "active",
        size: 5,
        uploadId: null,
        uploadToken: null,
        expiresAt: null,
      });
    });
  });

  describe("download.guard", () => {
    const downloadContext = () => ({
      ...objectContext("download"),
      mode: "presign" as const,
      disposition: "attachment" as const,
    });

    it("allows an active object of the scope", async () => {
      const { hooks, insert } = setup();
      await insert();

      await expect(
        defined(hooks.download?.guard)(downloadContext()),
      ).resolves.toBeUndefined();
    });

    it("rejects a pending object or one of another scope", async () => {
      const pending = setup();
      await pending.insert(pendingRow);
      await expect(
        defined(pending.hooks.download?.guard)(downloadContext()),
      ).rejects.toMatchObject({ code: "OBJECT_NOT_FOUND" });

      const foreign = setup();
      await foreign.insert({ scope: "user:2" });
      await expect(
        defined(foreign.hooks.download?.guard)(downloadContext()),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  describe("delete", () => {
    const deleteContext = (): DeleteOnDeletedContext => objectContext("delete");

    it("guards on ownership", async () => {
      const missing = setup();
      await expect(
        defined(missing.hooks.delete?.guard)(deleteContext()),
      ).rejects.toMatchObject({ code: "OBJECT_NOT_FOUND" });

      const foreign = setup();
      await foreign.insert({ scope: "user:2" });
      await expect(
        defined(foreign.hooks.delete?.guard)(deleteContext()),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });

      const own = setup();
      await own.insert(pendingRow);
      await expect(
        defined(own.hooks.delete?.guard)(deleteContext()),
      ).resolves.toBeUndefined();
    });

    it("soft-deletes by default and hard-deletes when configured", async () => {
      const soft = setup();
      await soft.insert();
      await defined(soft.hooks.delete?.onDeleted)(deleteContext());
      await expect(soft.row()).resolves.toMatchObject({ status: "deleted" });

      const hard = setup({ deleteMode: "hard" });
      await hard.insert();
      await defined(hard.hooks.delete?.onDeleted)(deleteContext());
      await expect(hard.row()).resolves.toBeNull();
    });

    it.each([
      ["a pending row", pendingRow],
      ["an overwrite", overwrittenRow],
    ])("aborts the multipart upload of %s", async (_name, values) => {
      const send = vi.fn(async (_command: unknown) => ({}));
      const { hooks, insert, row } = setup({
        client: { send } as unknown as S3Client,
      });
      await insert({ ...values, uploadId: "up-1" });

      await defined(hooks.delete?.onDeleted)(deleteContext());
      expect(send).toHaveBeenCalledWith(
        expect.any(AbortMultipartUploadCommand),
      );
      expect(send.mock.calls[0]?.[0]).toMatchObject({
        input: { Bucket: "b", Key: "k", UploadId: "up-1" },
      });
      await expect(row()).resolves.toMatchObject({ status: "deleted" });
    });

    it("still deletes the row when the abort fails", async () => {
      const send = vi.fn(async () => {
        throw new Error("network");
      });
      const { hooks, insert, row } = setup({
        client: { send } as unknown as S3Client,
      });
      await insert({ ...pendingRow, uploadId: "up-1" });

      await defined(hooks.delete?.onDeleted)(deleteContext());
      await expect(row()).resolves.toMatchObject({ status: "deleted" });
    });
  });
});
