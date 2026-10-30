import { describe, expect, it } from "vitest";
import { memoryObjectSource } from "./memory-object-source";
import type { ObjectListQueryInput } from "./types";

type Record = {
  id: string;
  name: string;
  folder: string | null;
  size: number | null;
  updatedAt?: string;
};

const RECORDS: Record[] = [
  { id: "1", name: "b.txt", folder: null, size: 20, updatedAt: "2026-01-02" },
  { id: "2", name: "a10.txt", folder: null, size: 5, updatedAt: "2026-01-03" },
  { id: "3", name: "a2.txt", folder: null, size: null },
  { id: "4", name: "Résumé.pdf", folder: "Docs", size: 1 },
  { id: "5", name: "deep.png", folder: "Docs/Images", size: 2 },
  { id: "6", name: "Notes.md", folder: "Archive", size: 3 },
];

function input(
  patch: Partial<ObjectListQueryInput> = {},
): ObjectListQueryInput {
  return {
    parent: null,
    cursor: null,
    sort: null,
    search: "",
    signal: new AbortController().signal,
    ...patch,
  };
}

const source = memoryObjectSource(RECORDS, {
  getKey: (record) => record.id,
  getFile: (record) => ({
    name: record.name,
    size: record.size,
    updatedAt: record.updatedAt,
  }),
  getFolder: (record) => record.folder,
  pageSize: 2,
  usage: true,
});

describe("memoryObjectSource", () => {
  it("lists one level, pages files, and sends folders on the first page", async () => {
    const first = await source.query(input());
    expect(first.folders).toEqual([
      { id: "Archive", name: "Archive" },
      { id: "Docs", name: "Docs" },
    ]);
    expect(first.items.map((record) => record.id)).toEqual(["1", "2"]);
    expect(first.nextCursor).toBe("2");
    expect(first.usage).toEqual({ totalBytes: 31, objectCount: 6 });

    const second = await source.query(input({ cursor: "2" }));
    expect(second.folders).toBeUndefined();
    expect(second.items.map((record) => record.id)).toEqual(["3"]);
    expect(second.nextCursor).toBeNull();
  });

  it("sorts by name with numbers in order, and by size with blanks last", async () => {
    const byName = await source.query(
      input({ sort: { field: "name", direction: "asc" }, cursor: "0" }),
    );
    expect(byName.items.map((record) => record.name)).toEqual([
      "a2.txt",
      "a10.txt",
    ]);

    const bySize = memoryObjectSource(RECORDS, {
      getKey: (record) => record.id,
      getFile: (record) => ({ name: record.name, size: record.size }),
      getFolder: (record) => record.folder,
    });
    const desc = await bySize.query(
      input({ sort: { field: "size", direction: "desc" } }),
    );
    expect(desc.items.map((record) => record.id)).toEqual(["1", "2", "3"]);
    const folders = await bySize.query(
      input({ sort: { field: "name", direction: "desc" } }),
    );
    expect(folders.folders?.map((folder) => folder.id)).toEqual([
      "Docs",
      "Archive",
    ]);
  });

  it("searches names in the open folder, ignoring case and accents", async () => {
    const page = await source.query(
      input({ parent: "Docs", search: "resume" }),
    );
    expect(page.items.map((record) => record.id)).toEqual(["4"]);
    expect(page.folders).toEqual([]);

    const folders = await source.query(input({ search: "doc" }));
    expect(folders.folders).toEqual([{ id: "Docs", name: "Docs" }]);
    expect(folders.items).toEqual([]);
  });

  it("reads the latest records from a function", async () => {
    const records: Record[] = [];
    const live = memoryObjectSource(() => records, {
      getKey: (record) => record.id,
      getFile: (record) => ({ name: record.name }),
    });
    records.push({ id: "n", name: "new.txt", folder: null, size: 1 });

    const page = await live.query(input());
    expect(page.items).toEqual(records);
  });
});
