import { describe, expect, it, vi } from "vitest";
import { memoryDbClient } from "@/test/fakes";
import type { DbListSort } from "@/types/storage-object";
import type {
  DimahS3DbClient,
  ListByScopeInput,
  StorageObjectStore,
} from "./storage-object-store";
import { createStorageObjectStore } from "./storage-object-store";
import type { StorageObjectRow } from "./map-row";
import { DEFAULT_LIST_SORT, encodeListCursor } from "./list-cursor";

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

function createStore(
  overrides: {
    returning?: StorageObjectRow;
    findFirst?: StorageObjectRow | null;
  } = {},
) {
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

  it("filters a scope listing by key prefix in the query", async () => {
    const { store, orm } = createStore();

    await store.listByScope({
      scope: "user:1",
      prefix: "docs/",
      limit: 20,
    });

    const [, options] = orm.findMany.mock.calls[0] as unknown as [
      string,
      { where: (builder: Record<string, unknown>) => unknown },
    ];
    const { compares } = invokeWhere(options.where);
    expect(compares).toEqual(
      expect.arrayContaining([
        ["scope", "=", "user:1"],
        ["status", "=", "active"],
        ["key", "starts with", "docs/"],
      ]),
    );
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

function day(n: number): Date {
  return new Date(Date.UTC(2024, 0, n));
}

/** Active rows for `user:1` with tied dates and sizes and missing values. */
const listed: StorageObjectRow[] = [
  { id: "a", filename: "report-q1.pdf", size: 300n, createdAt: day(1) },
  { id: "b", filename: "Report-q2.pdf", size: 100n, createdAt: day(2) },
  { id: "c", filename: "report-q3.pdf", size: 300n, createdAt: day(2) },
  { id: "d", filename: null, size: 200n, createdAt: day(3) },
  { id: "e", filename: "report-draft.pdf", size: null, createdAt: day(3) },
  { id: "f", filename: "report-final.pdf", size: null, createdAt: day(4) },
  { id: "g", filename: "notes.txt", size: 50n, createdAt: day(5) },
  { id: "h", filename: "report-q3.pdf", size: 100n, createdAt: day(5) },
  { id: "x", scope: "user:2", filename: "report-x.pdf", createdAt: day(6) },
  { id: "y", status: "deleted", filename: "report-y.pdf", createdAt: day(6) },
].map((patch) =>
  row({ status: "active", uploadId: null, key: patch.id, ...patch }),
);

/** Page through `listByScope` the way `GET /db/objects` does. */
async function listPages(
  store: StorageObjectStore,
  input: Omit<ListByScopeInput, "scope" | "cursor" | "limit">,
  pageSize: number,
): Promise<string[][]> {
  const pages: string[][] = [];
  let cursor: string | undefined;
  do {
    const rows = await store.listByScope({
      ...input,
      scope: "user:1",
      limit: pageSize + 1,
      cursor,
    });
    const page = rows.slice(0, pageSize);
    pages.push(page.map((object) => object.id));
    const last = page.at(-1);
    cursor =
      rows.length > pageSize && last
        ? encodeListCursor(input.sort ?? DEFAULT_LIST_SORT, last)
        : undefined;
  } while (cursor && pages.length < 20);
  return pages;
}

describe("listByScope order and cursors", () => {
  const cases: [
    string,
    DbListSort | undefined,
    string | undefined,
    string[],
  ][] = [
    ["default", undefined, undefined, ["h", "g", "f", "e", "d", "c", "b", "a"]],
    [
      "createdAt asc",
      { field: "createdAt", direction: "asc" },
      "report",
      ["a", "c", "e", "f", "h"],
    ],
    [
      "size desc",
      { field: "size", direction: "desc" },
      "report",
      ["c", "a", "h", "f", "e"],
    ],
    [
      "size asc",
      { field: "size", direction: "asc" },
      "report",
      ["h", "a", "c", "e", "f"],
    ],
    [
      "size asc, unfiltered",
      { field: "size", direction: "asc" },
      undefined,
      ["g", "b", "h", "d", "a", "c", "e", "f"],
    ],
    [
      "filename asc",
      { field: "filename", direction: "asc" },
      undefined,
      ["b", "g", "e", "f", "a", "c", "h", "d"],
    ],
    [
      "filename desc",
      { field: "filename", direction: "desc" },
      "q",
      ["h", "c", "a", "b"],
    ],
  ];

  for (const nulls of ["low", "high"] as const) {
    for (const [name, sort, search, expected] of cases) {
      it(`pages ${name} without gaps or repeats (nulls ${nulls})`, async () => {
        const store = createStorageObjectStore(
          memoryDbClient(listed, { nulls }),
        );
        const pages = await listPages(store, { sort, search }, 2);
        expect(pages.flat()).toEqual(expected);
        expect(pages.slice(0, -1).every((page) => page.length === 2)).toBe(
          true,
        );
        const all = await store.listByScope({ scope: "user:1", sort, search });
        expect(all.map((object) => object.id)).toEqual(expected);
      });
    }
  }

  it("ignores a cursor made under another sort", async () => {
    const store = createStorageObjectStore(memoryDbClient(listed));
    const [newest] = await store.listByScope({ scope: "user:1", limit: 1 });
    if (!newest) throw new Error("expected a row");
    const cursor = encodeListCursor(DEFAULT_LIST_SORT, newest);

    const rows = await store.listByScope({
      scope: "user:1",
      sort: { field: "size", direction: "asc" },
      search: "report",
      limit: 2,
      cursor,
    });
    expect(rows.map((object) => object.id)).toEqual(["h", "a"]);
  });

  it("applies an offset across rows with and without a sort value", async () => {
    const store = createStorageObjectStore(memoryDbClient(listed));
    const page = (offset: number) =>
      store
        .listByScope({
          scope: "user:1",
          sort: { field: "size", direction: "asc" },
          search: "report",
          limit: 2,
          offset,
        })
        .then((rows) => rows.map((object) => object.id));

    await expect(page(1)).resolves.toEqual(["a", "c"]);
    await expect(page(2)).resolves.toEqual(["c", "e"]);
    await expect(page(3)).resolves.toEqual(["e", "f"]);
    await expect(page(4)).resolves.toEqual(["f"]);
    await expect(page(5)).resolves.toEqual([]);
  });
});
