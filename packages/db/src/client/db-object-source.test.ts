import { describe, expect, it, vi } from "vitest";
import type {
  DbClientListResponse,
  DbClientObject,
} from "@/types/storage-object";
import {
  dbObjectFile,
  dbObjectSource,
  type DbObjectListSource,
} from "./db-object-source";

function row(patch: Partial<DbClientObject> = {}): DbClientObject {
  return {
    id: "row-1",
    bucket: "b",
    key: "docs/uuid/notes.md",
    route: "docs",
    filename: "Notes.md",
    contentType: "text/markdown",
    size: 4096,
    declaredSize: null,
    status: "active",
    createdAt: "2024-01-01T00:00:00.000Z",
    ...patch,
  };
}

const page: DbClientListResponse = {
  scope: "user:1",
  usage: { totalBytes: 12, objectCount: 1 },
  objects: [row()],
  nextCursor: "cursor-2",
};

describe("dbObjectSource", () => {
  it("maps the folder id to a key prefix and forwards the abort signal", async () => {
    const listObjects = vi.fn(async () => page);
    const controller = new AbortController();
    const source = dbObjectSource(listObjects, { route: "docs", limit: 20 });

    await expect(
      source.query({
        parent: "docs/",
        cursor: "cursor-1",
        signal: controller.signal,
      }),
    ).resolves.toEqual({
      items: page.objects,
      nextCursor: "cursor-2",
      usage: page.usage,
    });

    expect(listObjects).toHaveBeenCalledWith(
      { prefix: "docs/", cursor: "cursor-1", route: "docs", limit: 20 },
      { signal: controller.signal },
    );
  });

  it("omits an empty folder and cursor", async () => {
    const listObjects = vi.fn(async () => ({ ...page, nextCursor: null }));
    const source = dbObjectSource(listObjects);

    await expect(
      source.query({
        parent: null,
        cursor: null,
        signal: new AbortController().signal,
      }),
    ).resolves.toMatchObject({ nextCursor: null });

    expect(listObjects).toHaveBeenCalledWith({}, expect.any(Object));
  });

  it("forwards search and maps the list sort to listObjects columns", async () => {
    const listObjects = vi.fn<DbObjectListSource>(async () => page);
    const source = dbObjectSource(listObjects);
    const query = (sort: { field: string; direction: "asc" | "desc" } | null) =>
      source.query({
        parent: null,
        cursor: null,
        sort,
        search: "notes",
        signal: new AbortController().signal,
      });

    await query({ field: "name", direction: "asc" });
    await query({ field: "updatedAt", direction: "desc" });
    await query({ field: "size", direction: "desc" });
    await query({ field: "owner", direction: "asc" });
    await query(null);

    expect(listObjects.mock.calls.map(([input]) => input)).toEqual([
      { search: "notes", sort: { field: "filename", direction: "asc" } },
      { search: "notes", sort: { field: "createdAt", direction: "desc" } },
      { search: "notes", sort: { field: "size", direction: "desc" } },
      { search: "notes" },
      { search: "notes" },
    ]);
  });

  it("omits empty search text", async () => {
    const listObjects = vi.fn(async () => page);
    await dbObjectSource(listObjects).query({
      parent: null,
      cursor: null,
      sort: null,
      search: "",
      signal: new AbortController().signal,
    });
    expect(listObjects).toHaveBeenCalledWith({}, expect.any(Object));
  });

  it("keys rows by id", () => {
    expect(dbObjectSource(vi.fn()).getKey(row())).toBe("row-1");
  });
});

describe("dbObjectFile", () => {
  it("reads the filename, object key, type, size, and date", () => {
    expect(dbObjectFile(row())).toEqual({
      name: "Notes.md",
      objectKey: "docs/uuid/notes.md",
      size: 4096,
      contentType: "text/markdown",
      updatedAt: "2024-01-01T00:00:00.000Z",
    });
  });

  it("falls back to the key leaf when the filename is missing", () => {
    expect(
      dbObjectFile(row({ filename: null, size: null, contentType: null })),
    ).toMatchObject({ name: "notes.md", size: null, contentType: null });
  });
});
