import { beforeEach, describe, expect, it } from "vitest";
import { insertObject, testDatabases, useTestDatabase } from "@/test/databases";
import type { DbListSort } from "@/types/client";
import { createDbStore } from "./create-db-store";
import type { ListObjectsInput, StorageObjectStore } from "./object-store";

function day(n: number): Date {
  return new Date(Date.UTC(2024, 0, n));
}

/**
 * Active root rows for `user:1` with tied dates and sizes and missing sizes,
 * plus rows other filters leave out. Names are lowercase letters and digits,
 * so every collation orders and matches them the same way.
 */
const rows = [
  {
    id: "a",
    filename: "report1",
    size: 300,
    createdAt: day(1),
    updatedAt: day(9),
  },
  { id: "b", filename: "report2", size: 100, createdAt: day(2) },
  { id: "c", filename: "report3", size: 300, createdAt: day(2) },
  { id: "d", filename: "data", size: 200, createdAt: day(3) },
  { id: "e", filename: "reportdraft", size: null, createdAt: day(3) },
  { id: "f", filename: "reportfinal", size: null, createdAt: day(4) },
  { id: "g", filename: "notes", size: 50, createdAt: day(5) },
  { id: "h", filename: "report3", size: 100, createdAt: day(5) },
  { id: "x", scope: "user:2", filename: "reportx", createdAt: day(6) },
  { id: "y", status: "deleted", filename: "reporty", createdAt: day(6) },
] as const;

/** Pages through `list` the way `GET /db/objects` does. */
async function listPages(
  store: StorageObjectStore,
  input: Omit<ListObjectsInput, "scope" | "cursor" | "limit">,
  limit: number,
): Promise<string[][]> {
  const pages: string[][] = [];
  let cursor: string | null = null;
  do {
    const page = await store.list({ ...input, scope: "user:1", limit, cursor });
    expect(page.firstPage).toBe(pages.length === 0);
    pages.push(page.objects.map((object) => object.id));
    cursor = page.nextCursor;
  } while (cursor && pages.length < 20);
  return pages;
}

describe.each(testDatabases)("object store list ($name)", (factory) => {
  const client = useTestDatabase(factory);
  const store = () => createDbStore(client()).objects;

  it("filters by an exact type or a type/* family", async () => {
    await insertObject(client(), { key: "a", contentType: "image/png" });
    await insertObject(client(), { key: "b", contentType: "image/webp" });
    await insertObject(client(), { key: "c", contentType: "application/pdf" });

    const keys = async (contentType: string) =>
      (await store().list({ scope: "user:1", contentType })).objects
        .map((object) => object.key)
        .sort();
    await expect(keys("image/*")).resolves.toEqual(["a", "b"]);
    await expect(keys("image/png")).resolves.toEqual(["a"]);
  });

  describe("order and cursors", () => {
    beforeEach(async () => {
      for (const row of rows) {
        await insertObject(client(), {
          key: row.id,
          updatedAt: row.createdAt,
          ...row,
        });
      }
    });

    const cases: [
      string,
      DbListSort | undefined,
      string | undefined,
      string[],
    ][] = [
      [
        "default",
        undefined,
        undefined,
        ["h", "g", "f", "e", "d", "c", "b", "a"],
      ],
      [
        "createdAt asc",
        { field: "createdAt", direction: "asc" },
        "report",
        ["a", "b", "c", "e", "f", "h"],
      ],
      [
        "updatedAt desc",
        { field: "updatedAt", direction: "desc" },
        undefined,
        ["a", "h", "g", "f", "e", "d", "c", "b"],
      ],
      [
        "size desc",
        { field: "size", direction: "desc" },
        "report",
        ["c", "a", "h", "b", "f", "e"],
      ],
      [
        "size asc",
        { field: "size", direction: "asc" },
        "report",
        ["b", "h", "a", "c", "e", "f"],
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
        ["d", "g", "a", "b", "c", "h", "e", "f"],
      ],
      [
        "filename desc",
        { field: "filename", direction: "desc" },
        "report",
        ["f", "e", "h", "c", "b", "a"],
      ],
    ];

    it.each(cases)(
      "pages %s without gaps or repeats",
      async (_, sort, search, expected) => {
        const pages = await listPages(store(), { sort, search }, 2);
        expect(pages.flat()).toEqual(expected);
        expect(pages.slice(0, -1).every((page) => page.length === 2)).toBe(
          true,
        );
        expect(pages.at(-1)?.length).toBeGreaterThan(0);

        const all = await store().list({
          scope: "user:1",
          sort,
          search,
          limit: 100,
        });
        expect(all.objects.map((object) => object.id)).toEqual(expected);
        expect(all.nextCursor).toBeNull();
      },
    );

    it("returns 50 rows per page by default", async () => {
      const page = await store().list({ scope: "user:1" });
      expect(page.objects).toHaveLength(8);
      expect(page.nextCursor).toBeNull();
    });

    it("restarts at the first page when the filters change", async () => {
      const first = await store().list({ scope: "user:1", limit: 2 });
      const cursor = first.nextCursor;
      expect(cursor).not.toBeNull();

      const next = await store().list({ scope: "user:1", limit: 2, cursor });
      expect(next.firstPage).toBe(false);
      expect(next.objects.map((object) => object.id)).toEqual(["f", "e"]);

      const changed: Omit<ListObjectsInput, "scope">[] = [
        { search: "report" },
        { folder: null },
        { status: "deleted" },
        { route: "uploads" },
        { contentType: "text/plain" },
        { sort: { field: "createdAt", direction: "asc" } },
      ];
      for (const filters of changed) {
        const restarted = await store().list({
          ...filters,
          scope: "user:1",
          limit: 2,
          cursor,
        });
        const fresh = await store().list({
          ...filters,
          scope: "user:1",
          limit: 2,
        });
        expect(restarted).toEqual(fresh);
        expect(restarted.firstPage).toBe(true);
      }
    });

    it("treats a malformed cursor as the first page", async () => {
      const first = await store().list({ scope: "user:1", limit: 2 });
      for (const cursor of ["not a cursor", "e30", "W10"]) {
        await expect(
          store().list({ scope: "user:1", limit: 2, cursor }),
        ).resolves.toEqual(first);
      }
    });
  });

  describe("filters", () => {
    it("lists one folder, the root, or every folder", async () => {
      await insertObject(client(), { key: "root" });
      await insertObject(client(), { key: "docs", folder: "docs" });
      await insertObject(client(), { key: "sub", folder: "docs/sub" });
      await insertObject(client(), {
        key: "other",
        folder: "docs",
        scope: "user:2",
      });
      const keys = async (folder: string | null | undefined) =>
        (await store().list({ scope: "user:1", folder })).objects
          .map((object) => object.key)
          .sort();

      await expect(keys(null)).resolves.toEqual(["root"]);
      await expect(keys("docs")).resolves.toEqual(["docs"]);
      await expect(keys("docs/sub")).resolves.toEqual(["sub"]);
      await expect(keys(undefined)).resolves.toEqual(["docs", "root", "sub"]);
    });

    it("filters by status, route, and content type", async () => {
      await insertObject(client(), { key: "a", contentType: "image/png" });
      await insertObject(client(), {
        key: "b",
        route: "avatars",
        contentType: "text/plain",
      });
      await insertObject(client(), { key: "c", status: "deleted" });
      await insertObject(client(), {
        key: "live",
        status: "pending",
        expiresAt: new Date(Date.now() + 60_000),
      });
      await insertObject(client(), {
        key: "expired",
        status: "pending",
        expiresAt: new Date(Date.now() - 60_000),
      });
      const keys = async (input: Omit<ListObjectsInput, "scope">) =>
        (await store().list({ ...input, scope: "user:1" })).objects
          .map((object) => object.key)
          .sort();

      await expect(keys({})).resolves.toEqual(["a", "b"]);
      await expect(keys({ status: "deleted" })).resolves.toEqual(["c"]);
      await expect(keys({ status: "pending" })).resolves.toEqual(["live"]);
      await expect(keys({ route: "avatars" })).resolves.toEqual(["b"]);
      await expect(keys({ contentType: "image/png" })).resolves.toEqual(["a"]);
    });
  });
});
