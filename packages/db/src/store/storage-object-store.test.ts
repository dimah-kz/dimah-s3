import { describe, expect, it, vi } from "vitest";
import type { DimahS3DbClient } from "./storage-object-store";
import { createStorageObjectStore } from "./storage-object-store";
import type { StorageObjectRow } from "./map-row";

function row(overrides: Partial<StorageObjectRow> = {}): StorageObjectRow {
  return {
    id: "1",
    scope: "user:1",
    bucket: "b",
    key: "k",
    route: "uploads",
    contentType: "text/plain",
    size: null,
    eTag: null,
    filename: "a.txt",
    status: "pending",
    metadata: null,
    acl: null,
    uploadId: "up-1",
    declaredSize: 1024n,
    confirmedAt: null,
    expiresAt: null,
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    updatedAt: new Date("2024-01-01T00:00:00.000Z"),
    deletedAt: null,
    ...overrides,
  };
}

function invokeWhere(where: (builder: Record<string, unknown>) => unknown) {
  const compares: [string, string, unknown][] = [];
  const nullChecks: string[] = [];
  const builder = Object.assign(
    (column: string, operator?: string, value?: unknown) => {
      if (operator !== undefined) compares.push([column, operator, value]);
      return { column, operator, value };
    },
    {
      and: (...parts: unknown[]) => parts,
      or: (...parts: unknown[]) => parts,
      isNull: (column: string) => {
        nullChecks.push(`null:${column}`);
        return { isNull: column };
      },
      isNotNull: (column: string) => {
        nullChecks.push(`notNull:${column}`);
        return { isNotNull: column };
      },
    },
  );
  where(builder as never);
  return { compares, nullChecks };
}

function createStore(overrides: {
  returning?: StorageObjectRow;
  findFirst?: StorageObjectRow | null;
} = {}) {
  const forceReturning = vi.fn(async () => overrides.returning ?? row());
  const upsert = vi.fn(() => ({ forceReturning }));
  const findFirst = vi.fn(async () =>
    overrides.findFirst === undefined ? row() : overrides.findFirst,
  );
  const updateMany = vi.fn(async () => {});
  const orm = {
    upsert,
    findFirst,
    updateMany,
    findMany: vi.fn(async () => []),
    deleteMany: vi.fn(async () => {}),
    count: vi.fn(async () => 0),
  };
  const db = { orm: () => orm } as unknown as DimahS3DbClient;
  return {
    store: createStorageObjectStore(db),
    orm,
    forceReturning,
  };
}

describe("createStorageObjectStore", () => {
  it("returns the upserted pending row from forceReturning", async () => {
    const { store, orm, forceReturning } = createStore({
      returning: row({ declaredSize: 2048n, filename: "b.bin" }),
    });

    const written = await store.upsertPending({
      scope: "user:1",
      bucket: "b",
      key: "k",
      route: "uploads",
      declaredSize: 2048,
      filename: "b.bin",
    });

    expect(orm.upsert).toHaveBeenCalledWith(
      "storageObject",
      expect.objectContaining({
        update: expect.objectContaining({
          status: "pending",
          declaredSize: 2048n,
        }),
        create: expect.objectContaining({
          bucket: "b",
          key: "k",
          updatedAt: expect.any(Date),
        }),
      }),
    );
    expect(forceReturning).toHaveBeenCalledOnce();
    expect(written).toMatchObject({
      status: "pending",
      declaredSize: 2048,
      filename: "b.bin",
    });
  });

  it("finds a pending multipart row in one query", async () => {
    const { store, orm } = createStore({
      findFirst: row({ declaredSize: 1024n }),
    });

    const found = await store.findPendingMultipart({
      bucket: "b",
      key: "k",
      fileSize: 1024,
    });

    expect(found).toMatchObject({
      status: "pending",
      uploadId: "up-1",
      declaredSize: 1024,
    });

    const [, options] = orm.findFirst.mock.calls[0] as unknown as [
      string,
      { where: (builder: Record<string, unknown>) => unknown },
    ];
    const { compares, nullChecks } = invokeWhere(options.where);
    expect(compares).toEqual(
      expect.arrayContaining([
        ["bucket", "=", "b"],
        ["key", "=", "k"],
        ["status", "=", "pending"],
        ["declaredSize", "=", 1024n],
      ]),
    );
    expect(nullChecks).toContain("notNull:uploadId");
  });

  it("promotes a pending row to active and returns it", async () => {
    const { store, orm } = createStore({
      findFirst: row({ status: "pending", uploadId: "up-1" }),
    });

    const active = await store.markActive({
      bucket: "b",
      key: "k",
      size: 1024,
      eTag: "etag",
      contentType: "application/octet-stream",
    });

    expect(orm.updateMany).toHaveBeenCalledWith(
      "storageObject",
      expect.objectContaining({
        set: expect.objectContaining({
          status: "active",
          size: 1024n,
          eTag: "etag",
          uploadId: null,
          declaredSize: null,
          deletedAt: null,
        }),
      }),
    );
    expect(active).toMatchObject({
      status: "active",
      size: 1024,
      eTag: "etag",
      contentType: "application/octet-stream",
      uploadId: null,
      declaredSize: null,
    });
  });

  it("refreshes an already-active row on overwrite", async () => {
    const { store, orm } = createStore({
      findFirst: row({
        status: "active",
        size: 10n,
        uploadId: null,
        declaredSize: null,
      }),
    });

    const active = await store.markActive({
      bucket: "b",
      key: "k",
      size: 20,
      eTag: "new",
    });

    expect(orm.updateMany).toHaveBeenCalledWith(
      "storageObject",
      expect.objectContaining({
        set: expect.not.objectContaining({ status: "active" }),
      }),
    );
    expect(active).toMatchObject({ status: "active", size: 20, eTag: "new" });
  });

  it("rejects confirm when the row is missing or deleted", async () => {
    const missing = createStore({ findFirst: null });
    await expect(
      missing.store.markActive({ bucket: "b", key: "k", size: 1 }),
    ).rejects.toMatchObject({ code: "OBJECT_NOT_FOUND" });

    const deleted = createStore({ findFirst: row({ status: "deleted" }) });
    await expect(
      deleted.store.markActive({ bucket: "b", key: "k", size: 1 }),
    ).rejects.toMatchObject({ code: "OBJECT_NOT_FOUND" });
  });
});
