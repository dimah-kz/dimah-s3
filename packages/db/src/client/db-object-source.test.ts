import { describe, expect, it, vi } from "vitest";
import type {
  DbClientActions,
  DbClientListObjectsResponse,
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
    folderId: null,
    name: "Notes.md",
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

const page: DbClientListObjectsResponse = {
  objects: [row()],
  nextCursor: "cursor-2",
};

function listObjectsReturning(response: DbClientListObjectsResponse = page) {
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
      { folderId: "" },
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
      folderId: "work/drafts",
      recursive: true,
      cursor: "cursor-1",
      search: "q3",
      route: "docs",
      status: "pending",
      contentType: "image/png",
      limit: 20,
    });
  });

  it("clamps limit to what the server takes", async () => {
    const listObjects = listObjectsReturning();
    const sent = async (limit: number) => {
      listObjects.mockClear();
      await dbObjectSource({ listObjects }, { limit }).query(queryInput());
      return listObjects.mock.calls[0]?.[0]?.limit;
    };

    await expect(sent(500)).resolves.toBe(100);
    await expect(sent(0)).resolves.toBe(1);
    await expect(sent(-3)).resolves.toBe(1);
    await expect(sent(20.9)).resolves.toBe(20);
    await expect(sent(Number.NaN)).resolves.toBe(100);
  });

  it("asks for the usage on the first page with usage: true", async () => {
    const listObjects = listObjectsReturning();
    const source = dbObjectSource({ listObjects }, { usage: true });

    await source.query(queryInput());
    await source.query(queryInput({ cursor: "cursor-2" }));

    expect(listObjects.mock.calls.map(([input]) => input?.usage)).toEqual([
      true,
      undefined,
    ]);
    listObjects.mockClear();
    await dbObjectSource({ listObjects }).query(queryInput());
    expect(listObjects.mock.calls[0]?.[0]).not.toHaveProperty("usage");
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
      { field: "name", direction: "asc" },
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
          id: "folder-1",
          path: "work/drafts",
          name: "drafts",
          parentId: "work",
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z",
          size: 40,
          objectCount: 2,
        },
      ],
      trail: [
        {
          id: "work",
          path: "work",
          name: "work",
          parentId: null,
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z",
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
      folders: [{ id: "folder-1", name: "drafts", size: 40, objectCount: 2 }],
      trail: [{ id: "work", name: "work" }],
      usage: { totalBytes: 12, objectCount: 1, maxBytes: 1024, maxFiles: 10 },
    });
  });

  it("searches the open folder's subtree, or the whole scope", async () => {
    const listObjects = listObjectsReturning();
    const source = dbObjectSource({ listObjects });

    await source.query(queryInput({ parent: "work", search: "q" }));
    await source.query(
      queryInput({ parent: "work", search: "q", searchScope: "all" }),
    );
    await source.query(queryInput({ parent: "work", searchScope: "all" }));

    expect(listObjects.mock.calls.map(([input]) => input)).toEqual([
      { folderId: "work", recursive: true, search: "q" },
      { folderId: "", recursive: true, search: "q" },
      { folderId: "work" },
    ]);
    expect(source.searchScopes).toEqual(["folder", "all"]);
    expect(
      dbObjectSource({ listObjects }, { folders: false }).searchScopes,
    ).toBeUndefined();
  });

  it("keeps a search to the open folder with recursiveSearch: false", async () => {
    const listObjects = listObjectsReturning();
    const source = dbObjectSource({ listObjects }, { recursiveSearch: false });

    await source.query(
      queryInput({ parent: "work", search: "q", searchScope: "all" }),
    );

    expect(listObjects.mock.calls[0]?.[0]).toEqual({
      folderId: "work",
      search: "q",
    });
    expect(source.searchScopes).toBeUndefined();
  });

  it("says where each search result lives", async () => {
    const folder = (id: string, name: string, parentId: string | null) => ({
      id,
      name,
      parentId,
      path: name,
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    });
    const atRoot = row({ id: "a" });
    const nested = row({ id: "b", folderId: "f-2024" });
    const listObjects = listObjectsReturning({
      objects: [atRoot, nested],
      nextCursor: null,
      folders: [folder("f-inv", "Invoices", "f-2024")],
      locations: [
        folder("f-docs", "Docs", null),
        folder("f-2024", "2024", "f-docs"),
      ],
      total: 2,
    });
    const source = dbObjectSource({ listObjects });

    const result = await source.query(queryInput({ search: "inv" }));

    const docs = [
      { id: "f-docs", name: "Docs" },
      { id: "f-2024", name: "2024" },
    ];
    expect(result).toMatchObject({
      folders: [{ id: "f-inv", name: "Invoices", location: docs }],
      total: 2,
    });
    expect(source.getFile(atRoot).location).toEqual([]);
    expect(source.getFile(nested).location).toEqual(docs);
    // A row the source did not return has no location.
    expect(source.getFile(row({ id: "c" }))).not.toHaveProperty("location");
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
    expect(source.getId(row())).toBe("row-1");
  });

  it("reads the name, object key, size, type, and updatedAt", () => {
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
      clientMetadata: { folderId: "work/drafts" },
    });
    expect(source.uploadOptions?.(null)).toEqual({
      clientMetadata: { folderId: "" },
    });
  });

  it("creates a folder inside the parent", async () => {
    const createFolder = vi.fn<DbClientActions["createFolder"]>(async () => ({
      folder: {
        id: "folder-1",
        path: "work/drafts",
        name: "drafts",
        parentId: "work",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      },
    }));
    const source = dbObjectSource({
      listObjects: listObjectsReturning(),
      createFolder,
    });

    await expect(
      source.createFolder?.({ parent: "work", name: "drafts" }),
    ).resolves.toEqual({ id: "folder-1", name: "drafts" });
    await source.createFolder?.({ parent: null, name: "drafts" });

    expect(createFolder.mock.calls.map(([input]) => input)).toEqual([
      { parentId: "work", name: "drafts" },
      { parentId: null, name: "drafts" },
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
    expect(source.renameFile).toBeUndefined();
    expect(source.renameFolder).toBeUndefined();
  });

  it("renames a file through updateObject and keeps the key", async () => {
    const updateObject = vi.fn<DbClientActions["updateObject"]>(async () => ({
      object: row({ name: "Renamed.md" }),
    }));
    const source = dbObjectSource({
      listObjects: listObjectsReturning(),
      updateObject,
    });

    await expect(
      source.renameFile?.({ item: row(), name: "Renamed.md" }),
    ).resolves.toMatchObject({
      key: row().key,
      bucket: "b",
      name: "Renamed.md",
    });
    expect(updateObject).toHaveBeenCalledWith({
      key: row().key,
      bucket: "b",
      name: "Renamed.md",
    });
  });

  it("renames a folder through updateFolder", async () => {
    const updateFolder = vi.fn<DbClientActions["updateFolder"]>(async () => ({
      folder: {
        id: "folder-1",
        path: "notes",
        name: "notes",
        parentId: null,
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      },
    }));
    const source = dbObjectSource({
      listObjects: listObjectsReturning(),
      updateFolder,
    });

    await expect(
      source.renameFolder?.({
        folder: { id: "folder-1", name: "drafts" },
        name: "notes",
      }),
    ).resolves.toEqual({ id: "folder-1", name: "notes" });
    expect(updateFolder).toHaveBeenCalledWith({
      id: "folder-1",
      name: "notes",
    });
  });

  it("rejects a folder name with a slash without calling the server", async () => {
    const updateFolder = vi.fn<DbClientActions["updateFolder"]>();
    const source = dbObjectSource({
      listObjects: listObjectsReturning(),
      updateFolder,
    });

    await expect(
      source.renameFolder?.({
        folder: { id: "folder-1", name: "drafts" },
        name: "a/b",
      }),
    ).rejects.toMatchObject({ code: "FOLDER_INVALID", statusCode: 400 });
    expect(updateFolder).not.toHaveBeenCalled();
  });

  it("has no folder actions with folders: false", () => {
    const source = dbObjectSource(
      {
        listObjects: listObjectsReturning(),
        createFolder: vi.fn(),
        updateObject: vi.fn(),
        updateFolder: vi.fn(),
      },
      { folders: false },
    );

    expect(source.uploadOptions).toBeUndefined();
    expect(source.createFolder).toBeUndefined();
    expect(source.renameFolder).toBeUndefined();
    expect(source.renameFile).toBeTypeOf("function");
  });
});
