import { describe, expect, it, vi } from "vitest";
import type {
  DbClientActions,
  DbClientListResponse,
  DbClientObject,
  DbObjectSourceQueryInput,
} from "@/types/client";
import { dbObjectSource } from "./db-object-source";

function row(patch: Partial<DbClientObject> = {}): DbClientObject {
  return {
    id: "row-1",
    bucket: "b",
    key: "users/1/uuid/notes.md",
    route: "docs",
    folder: null,
    filename: "Notes.md",
    contentType: "text/markdown",
    size: 4096,
    declaredSize: 4096,
    status: "active",
    attributes: null,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-02T00:00:00.000Z",
    ...patch,
  };
}

const page: DbClientListResponse = {
  objects: [row()],
  nextCursor: "cursor-2",
};

function listObjectsReturning(response: DbClientListResponse = page) {
  return vi.fn<DbClientActions["listObjects"]>(async () => response);
}

function queryInput(
  patch: Partial<DbObjectSourceQueryInput> = {},
): DbObjectSourceQueryInput {
  return {
    parent: null,
    cursor: null,
    sort: null,
    search: "",
    signal: new AbortController().signal,
    ...patch,
  };
}

describe("dbObjectSource query", () => {
  it("lists the root folder by default and forwards the signal", async () => {
    const listObjects = listObjectsReturning();
    const input = queryInput();

    await expect(dbObjectSource({ listObjects }).query(input)).resolves.toEqual(
      { items: page.objects, nextCursor: "cursor-2" },
    );
    expect(listObjects).toHaveBeenCalledWith(
      { folder: "" },
      { signal: input.signal },
    );
  });

  it("sends the open folder, cursor, search, and filters", async () => {
    const listObjects = listObjectsReturning();
    const source = dbObjectSource(
      { listObjects },
      { route: "docs", status: "pending", contentType: "image/png", limit: 20 },
    );

    await source.query(
      queryInput({ parent: "work/drafts", cursor: "cursor-1", search: "q3" }),
    );

    expect(listObjects.mock.calls[0]?.[0]).toEqual({
      folder: "work/drafts",
      cursor: "cursor-1",
      search: "q3",
      route: "docs",
      status: "pending",
      contentType: "image/png",
      limit: 20,
    });
  });

  it("lists every folder flat with folders: false", async () => {
    const listObjects = listObjectsReturning();
    const source = dbObjectSource({ listObjects }, { folders: false });

    await source.query(queryInput({ parent: "work" }));

    expect(listObjects.mock.calls[0]?.[0]).toEqual({});
  });

  it("maps the list sort to listObjects columns", async () => {
    const listObjects = listObjectsReturning();
    const source = dbObjectSource({ listObjects }, { folders: false });
    const fields = ["name", "size", "updatedAt", "owner", "constructor"];

    for (const field of fields) {
      await source.query(queryInput({ sort: { field, direction: "asc" } }));
    }
    await source.query(queryInput({ sort: null }));

    expect(listObjects.mock.calls.map(([input]) => input?.sort)).toEqual([
      { field: "filename", direction: "asc" },
      { field: "size", direction: "asc" },
      { field: "updatedAt", direction: "asc" },
      undefined,
      undefined,
      undefined,
    ]);
  });

  it("reads child folders and merges the limits into usage", async () => {
    const listObjects = listObjectsReturning({
      ...page,
      folders: [
        {
          path: "work/drafts",
          name: "drafts",
          parent: "work",
          createdAt: "2024-01-01T00:00:00.000Z",
        },
      ],
      usage: { totalBytes: 12, objectCount: 1 },
      limits: { maxBytes: 1024, maxFiles: 10 },
    });

    await expect(
      dbObjectSource({ listObjects }).query(queryInput({ parent: "work" })),
    ).resolves.toEqual({
      items: page.objects,
      nextCursor: "cursor-2",
      folders: [{ id: "work/drafts", name: "drafts" }],
      usage: { totalBytes: 12, objectCount: 1, maxBytes: 1024, maxFiles: 10 },
    });
  });

  it("keeps usage without caps when the scope has none", async () => {
    const listObjects = listObjectsReturning({
      ...page,
      usage: { totalBytes: 12, objectCount: 1 },
      limits: null,
    });

    await expect(
      dbObjectSource({ listObjects }).query(queryInput()),
    ).resolves.toMatchObject({ usage: { totalBytes: 12, objectCount: 1 } });
  });
});

describe("dbObjectSource rows", () => {
  const source = dbObjectSource({ listObjects: listObjectsReturning() });

  it("keys rows by id", () => {
    expect(source.getKey(row())).toBe("row-1");
  });

  it("reads the filename, object key, size, type, and updatedAt", () => {
    expect(source.getFile(row())).toEqual({
      name: "Notes.md",
      objectKey: "users/1/uuid/notes.md",
      size: 4096,
      contentType: "text/markdown",
      updatedAt: "2024-01-02T00:00:00.000Z",
    });
  });

  it("keeps a pending row's missing size and type", () => {
    expect(
      source.getFile(row({ size: null, contentType: null })),
    ).toMatchObject({ size: null, contentType: null });
  });
});

describe("dbObjectSource folders", () => {
  it("uploads into the given folder, with the root as an empty string", () => {
    const source = dbObjectSource({ listObjects: listObjectsReturning() });

    expect(source.uploadOptions?.("work/drafts")).toEqual({
      metadata: { folder: "work/drafts" },
    });
    expect(source.uploadOptions?.(null)).toEqual({ metadata: { folder: "" } });
  });

  it("creates a folder inside the parent", async () => {
    const createFolder = vi.fn<DbClientActions["createFolder"]>(async () => ({
      folder: {
        path: "work/drafts",
        name: "drafts",
        parent: "work",
        createdAt: "2024-01-01T00:00:00.000Z",
      },
    }));
    const source = dbObjectSource({
      listObjects: listObjectsReturning(),
      createFolder,
    });

    await expect(
      source.createFolder?.({ parent: "work", name: "drafts" }),
    ).resolves.toEqual({ id: "work/drafts", name: "drafts" });
    await source.createFolder?.({ parent: null, name: "drafts" });

    expect(createFolder.mock.calls.map(([input]) => input)).toEqual([
      { path: "work/drafts" },
      { path: "drafts" },
    ]);
  });

  it("rejects a name with a slash without calling the server", async () => {
    const createFolder = vi.fn<DbClientActions["createFolder"]>();
    const source = dbObjectSource({
      listObjects: listObjectsReturning(),
      createFolder,
    });

    await expect(
      source.createFolder?.({ parent: null, name: "a/b" }),
    ).rejects.toMatchObject({ code: "FOLDER_INVALID", statusCode: 400 });
    expect(createFolder).not.toHaveBeenCalled();
  });

  it("has no createFolder without the action", () => {
    const source = dbObjectSource({ listObjects: listObjectsReturning() });
    expect(source.createFolder).toBeUndefined();
  });

  it("has no folder actions with folders: false", () => {
    const source = dbObjectSource(
      { listObjects: listObjectsReturning(), createFolder: vi.fn() },
      { folders: false },
    );

    expect(source.uploadOptions).toBeUndefined();
    expect(source.createFolder).toBeUndefined();
  });
});
