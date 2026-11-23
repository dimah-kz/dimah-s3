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
    name: "report1",
    size: 300,
    createdAt: day(1),
    updatedAt: day(9),
  },
  { id: "b", name: "report2", size: 100, createdAt: day(2) },
  { id: "c", name: "report3", size: 300, createdAt: day(2) },
  { id: "d", name: "data", size: 200, createdAt: day(3) },
  { id: "e", name: "reportdraft", size: null, createdAt: day(3) },
  { id: "f", name: "reportfinal", size: null, createdAt: day(4) },
  { id: "g", name: "notes", size: 50, createdAt: day(5) },
  { id: "h", name: "report3", size: 100, createdAt: day(5) },
  { id: "x", scope: "user:2", name: "reportx", createdAt: day(6) },
  { id: "y", status: "deleted", name: "reporty", createdAt: day(6) },
] as const;

/** Pages through `list` the way `GET /db/objects` does. */
async function listPages(
  store: StorageObjectStore,
  input: Omit<ListObjectsInput, "cursor" | "limit">,
  limit: number,
): Promise<string[][]> {
  const pages: string[][] = [];
  let cursor: string | null = null;
  do {
    const page = await store.list("user:1", { ...input, limit, cursor });
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
      (await store().list("user:1", { contentType })).objects
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
        "name asc",
        { field: "name", direction: "asc" },
        undefined,
        ["d", "g", "a", "b", "c", "h", "e", "f"],
      ],
      [
        "name desc",
        { field: "name", direction: "desc" },
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

        const all = await store().list("user:1", { sort, search, limit: 100 });
        expect(all.objects.map((object) => object.id)).toEqual(expected);
        expect(all.nextCursor).toBeNull();
      },
    );

    it("orders names without regard to case or accents", async () => {
      const names = ["Zebra.txt", "apple.txt", "Édith.txt", "dora.txt"];
      for (const name of names) {
        await insertObject(client(), { key: name, name, scope: "user:9" });
      }

      const sorted = async (direction: "asc" | "desc") => {
        const pages: string[] = [];
        let cursor: string | null = null;
        do {
          const page = await store().list("user:9", {
            sort: { field: "name", direction },
            limit: 3,
            cursor,
          });
          pages.push(...page.objects.map((object) => object.name));
          cursor = page.nextCursor;
        } while (cursor);
        return pages;
      };

      const ascending = ["apple.txt", "dora.txt", "Édith.txt", "Zebra.txt"];
      await expect(sorted("asc")).resolves.toEqual(ascending);
      await expect(sorted("desc")).resolves.toEqual(ascending.toReversed());
    });

    it("returns 50 rows per page by default", async () => {
      const page = await store().list("user:1");
      expect(page.objects).toHaveLength(8);
      expect(page.nextCursor).toBeNull();
    });

    it("restarts at the first page when the filters change", async () => {
      const first = await store().list("user:1", { limit: 2 });
      const cursor = first.nextCursor;
      expect(cursor).not.toBeNull();

      const next = await store().list("user:1", { limit: 2, cursor });
      expect(next.firstPage).toBe(false);
      expect(next.objects.map((object) => object.id)).toEqual(["f", "e"]);

      const changed: Omit<ListObjectsInput, "scope">[] = [
        { search: "report" },
        { folderId: null },
        { status: "deleted" },
        { route: "uploads" },
        { contentType: "text/plain" },
        { sort: { field: "createdAt", direction: "asc" } },
      ];
      for (const filters of changed) {
        const restarted = await store().list("user:1", {
          ...filters,
          limit: 2,
          cursor,
        });
        const fresh = await store().list("user:1", { ...filters, limit: 2 });
        expect(restarted).toEqual(fresh);
        expect(restarted.firstPage).toBe(true);
      }
    });

    it("treats a malformed cursor as the first page", async () => {
      const first = await store().list("user:1", { limit: 2 });
      for (const cursor of ["not a cursor", "e30", "W10"]) {
        await expect(
          store().list("user:1", { limit: 2, cursor }),
        ).resolves.toEqual(first);
      }
    });
  });

  describe("filters", () => {
    it("lists one folder, the root, or every folder", async () => {
      await insertObject(client(), { key: "root" });
      await insertObject(client(), { key: "docs", folderId: "docs" });
      await insertObject(client(), { key: "sub", folderId: "docs/sub" });
      await insertObject(client(), {
        key: "other",
        folderId: "docs",
        scope: "user:2",
      });
      const keys = async (folderId: string | null | undefined) =>
        (await store().list("user:1", { folderId })).objects
          .map((object) => object.key)
          .sort();

      await expect(keys(null)).resolves.toEqual(["root"]);
      await expect(keys("docs")).resolves.toEqual(["docs"]);
      await expect(keys("docs/sub")).resolves.toEqual(["sub"]);
      await expect(keys(undefined)).resolves.toEqual(["docs", "root", "sub"]);
    });

    it("covers the folders below one folder with recursive", async () => {
      const store_ = createDbStore(client());
      const docs = await store_.folders.create("user:1", {
        parentId: null,
        name: "docs",
      });
      const sub = await store_.folders.create("user:1", {
        parentId: docs.id,
        name: "sub",
      });
      const deep = await store_.folders.create("user:1", {
        parentId: sub.id,
        name: "deep",
      });
      const other = await store_.folders.create("user:1", {
        parentId: null,
        name: "other",
      });
      await insertObject(client(), { key: "root" });
      await insertObject(client(), { key: "docs", folderId: docs.id });
      await insertObject(client(), { key: "sub", folderId: sub.id });
      await insertObject(client(), { key: "deep", folderId: deep.id });
      await insertObject(client(), { key: "other", folderId: other.id });
      const keys = async (folderId: string | null) =>
        (
          await store_.objects.list("user:1", { folderId, recursive: true })
        ).objects
          .map((object) => object.key)
          .sort();

      await expect(keys(docs.id)).resolves.toEqual(["deep", "docs", "sub"]);
      await expect(keys(deep.id)).resolves.toEqual(["deep"]);
      await expect(keys(null)).resolves.toEqual([
        "deep",
        "docs",
        "other",
        "root",
        "sub",
      ]);
      await expect(keys("missing")).resolves.toEqual([]);
      await expect(
        store_.objects.count("user:1", { folderId: sub.id, recursive: true }),
      ).resolves.toBe(2);
    });

    it("searches names without case, accents, or wildcards", async () => {
      const names = [
        "Invoice-March.PDF",
        "facture-été.pdf",
        "كتاب علي.txt",
        "گزارش ۱۴۰۲.xlsx",
        "50%_off.png",
        "50 percent off.png",
        "back\\slash.txt",
      ];
      for (const [index, name] of names.entries()) {
        await insertObject(client(), { key: `k${index}`, name });
      }
      const found = async (search: string) =>
        (await store().list("user:1", { search })).objects
          .map((object) => object.name)
          .sort();

      await expect(found("invoice-march")).resolves.toEqual([
        "Invoice-March.PDF",
      ]);
      await expect(found("ETE")).resolves.toEqual(["facture-été.pdf"]);
      await expect(found("کتاب علی")).resolves.toEqual(["كتاب علي.txt"]);
      await expect(found("1402")).resolves.toEqual(["گزارش ۱۴۰۲.xlsx"]);
      await expect(found("%_")).resolves.toEqual(["50%_off.png"]);
      await expect(found("_")).resolves.toEqual(["50%_off.png"]);
      await expect(found("k\\s")).resolves.toEqual(["back\\slash.txt"]);
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
      const keys = async (input: ListObjectsInput) =>
        (await store().list("user:1", input)).objects
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
