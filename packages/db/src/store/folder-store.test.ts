import { describe, expect, it, vi } from "vitest";
import { DB_SCHEMA_VERSION, type DimahS3DbClient } from "@/fuma-db";
import { insertObject, testDatabases, useTestDatabase } from "@/test/databases";
import type { StorageFolder } from "@/types/storage-object";
import { createDbStore } from "./create-db-store";

describe.each(testDatabases)("folder store ($name)", (factory) => {
  const client = useTestDatabase(factory);
  const folders = () => createDbStore(client()).folders;

  const paths = async (scope = "user:1") => {
    const rows = await client()
      .orm(DB_SCHEMA_VERSION)
      .findMany("storageFolder", {
        where: (b) => b("scope", "=", scope),
      });
    return rows.map((row) => row.path).sort();
  };

  /** Creates each missing segment of `path` and returns the last folder. */
  const nest = async (path: string, scope = "user:1") => {
    let parentId: string | null = null;
    let folder: StorageFolder | undefined;
    for (const name of path.split("/")) {
      const children = await folders().children(scope, parentId);
      folder =
        children.find((child) => child.name === name) ??
        (await folders().create(scope, { parentId, name }));
      parentId = folder.id;
    }
    if (!folder) throw new Error("empty path");
    return folder;
  };

  type Orm = ReturnType<DimahS3DbClient["orm"]>;

  /**
   * Makes every store over this client see `wrap(orm)`: a way to run a
   * write of "another request" between a store's check and its own write.
   */
  const intercept = (wrap: (orm: Orm) => Partial<Orm>) => {
    const database = client();
    const real = database.orm.bind(database);
    vi.spyOn(database, "orm").mockImplementation(((
      ...args: Parameters<typeof real>
    ) => {
      const orm = real(...args);
      return { ...orm, ...wrap(orm) };
    }) as typeof database.orm);
  };

  describe("create", () => {
    it("puts the parent back when it is deleted while a child is created", async () => {
      const parent = await nest("a");
      intercept((orm) => ({
        create: (async (table: "storageFolder", values: never) => {
          // The parent goes after the store checked it and before the child lands.
          await orm.deleteMany("storageFolder", {
            where: (b) => b("id", "=", parent.id),
          });
          return orm.create(table, values);
        }) as Orm["create"],
      }));

      const child = await folders().create("user:1", {
        parentId: parent.id,
        name: "b",
      });

      expect(child).toMatchObject({ parentId: parent.id, path: "a/b" });
      await expect(folders().find("user:1", parent.id)).resolves.toMatchObject({
        id: parent.id,
        path: "a",
      });
    });

    it("counts the folders of a scope", async () => {
      await nest("a/b");
      await nest("c", "user:2");

      await expect(folders().count("user:1")).resolves.toBe(2);
      await expect(folders().count("user:3")).resolves.toBe(0);
    });

    it("creates one folder under a parent that exists", async () => {
      const parent = await folders().create("user:1", {
        parentId: null,
        name: "a",
      });
      await expect(
        folders().create("user:1", { parentId: parent.id, name: "b" }),
      ).resolves.toMatchObject({
        path: "a/b",
        parentId: parent.id,
        name: "b",
      });
      await expect(paths()).resolves.toEqual(["a", "a/b"]);
    });

    it("rejects a missing parent, a bad name, and a duplicate name", async () => {
      await expect(
        folders().create("user:1", { parentId: "missing", name: "a" }),
      ).rejects.toMatchObject({ code: "FOLDER_NOT_FOUND" });
      await expect(
        folders().create("user:1", { parentId: null, name: "a/b" }),
      ).rejects.toMatchObject({ code: "FOLDER_INVALID" });

      const parent = await folders().create("user:1", {
        parentId: null,
        name: "a",
      });
      await folders().create("user:1", { parentId: parent.id, name: "b" });
      await expect(
        folders().create("user:1", { parentId: parent.id, name: "b" }),
      ).rejects.toMatchObject({ code: "FOLDER_EXISTS" });
      await expect(
        folders().create("user:1", { parentId: null, name: "a" }),
      ).rejects.toMatchObject({ code: "FOLDER_EXISTS" });
    });

    it("lets one of several concurrent creates win", async () => {
      const store = folders();
      const results = await Promise.allSettled(
        Array.from({ length: 4 }, () =>
          store.create("user:1", { parentId: null, name: "a" }),
        ),
      );
      const reasons = results.flatMap((result) =>
        result.status === "rejected" ? [result.reason] : [],
      );
      expect(reasons).toEqual(
        Array.from({ length: 3 }, () =>
          expect.objectContaining({ code: "FOLDER_EXISTS" }),
        ),
      );
      await expect(paths()).resolves.toEqual(["a"]);
    });

    it("keeps scopes apart", async () => {
      await folders().create("user:1", { parentId: null, name: "a" });
      await nest("a/b", "user:2");
      await expect(paths("user:1")).resolves.toEqual(["a"]);
      await expect(paths("user:2")).resolves.toEqual(["a", "a/b"]);
    });
  });

  describe("children and trail", () => {
    it("lists direct children by name and walks up to the root", async () => {
      const leaf = await nest("b");
      await nest("a/z");
      await nest("a/y/deep");
      await nest("c");
      const a = await nest("a/x");
      await nest("d", "user:2");

      const root = await folders().children("user:1", null);
      expect(root.map((folder) => folder.name)).toEqual(["a", "b", "c"]);

      // By folded name, like the name sort of the objects: case and accents
      // do not count, on every database.
      for (const name of ["Zebra", "apple", "Édith", "dora"]) {
        await folders().create("user:3", { parentId: null, name });
      }
      const mixed = await folders().children("user:3", null);
      expect(mixed.map((folder) => folder.name)).toEqual([
        "apple",
        "dora",
        "Édith",
        "Zebra",
      ]);
      const below = await folders().descendants("user:3", null);
      expect(below.map((folder) => folder.name)).toEqual([
        "apple",
        "dora",
        "Édith",
        "Zebra",
      ]);
      const parent = await folders().find("user:1", a.parentId ?? "");
      const children = await folders().children("user:1", parent?.id ?? null);
      expect(children.map((folder) => folder.name)).toEqual(["x", "y", "z"]);
      expect(
        (
          await folders().children("user:1", parent?.id ?? null, { limit: 2 })
        ).map((folder) => folder.name),
      ).toEqual(["x", "y"]);
      await expect(folders().children("user:1", leaf.id)).resolves.toEqual([]);

      await expect(
        folders()
          .trail("user:1", a.id)
          .then((trail) => trail.map((folder) => folder.name)),
      ).resolves.toEqual(["a", "x"]);
      await expect(folders().trail("user:1", "missing")).rejects.toMatchObject({
        code: "FOLDER_NOT_FOUND",
      });
    });
  });

  describe("descendants and ancestors", () => {
    it("finds folders at any depth, by name, with a folded search", async () => {
      await nest("Docs/Invoices/2024");
      await nest("Docs/Archive/invoices-old");
      await nest("Photos/Invoices");
      await nest("Facturé");
      const docs = (await folders().children("user:1", null)).find(
        (folder) => folder.name === "Docs",
      );
      if (!docs) throw new Error("missing Docs");
      const pathsOf = (rows: StorageFolder[]) => rows.map((row) => row.path);

      await expect(
        folders().descendants("user:1", docs.id).then(pathsOf),
      ).resolves.toEqual([
        "Docs/Invoices/2024",
        "Docs/Archive",
        "Docs/Invoices",
        "Docs/Archive/invoices-old",
      ]);
      await expect(
        folders()
          .descendants("user:1", docs.id, { search: "INVOICE" })
          .then(pathsOf),
      ).resolves.toEqual(["Docs/Invoices", "Docs/Archive/invoices-old"]);
      await expect(
        folders()
          .descendants("user:1", null, { search: "invoices" })
          .then(pathsOf),
      ).resolves.toEqual([
        "Docs/Invoices",
        "Photos/Invoices",
        "Docs/Archive/invoices-old",
      ]);
      await expect(
        folders()
          .descendants("user:1", null, { search: "facture" })
          .then(pathsOf),
      ).resolves.toEqual(["Facturé"]);
      await expect(
        folders().descendants("user:1", "missing"),
      ).rejects.toMatchObject({ code: "FOLDER_NOT_FOUND" });
    });

    it("cuts to the first folders by name, below a folder and at the root", async () => {
      // Created deepest first, so a walk by level would meet "a" last.
      await nest("top/x/y/a");
      await nest("top/c");
      await nest("top/b");
      const top = (await folders().children("user:1", null))[0];
      if (!top) throw new Error("missing top");
      const names = (rows: StorageFolder[]) => rows.map((row) => row.name);

      await expect(
        folders().descendants("user:1", top.id, { limit: 2 }).then(names),
      ).resolves.toEqual(["a", "b"]);
      await expect(
        folders().descendants("user:1", null, { limit: 2 }).then(names),
      ).resolves.toEqual(["a", "b"]);
      await expect(folders().subtreeIds("user:1", "missing")).resolves.toEqual(
        [],
      );
    });

    it("lists every folder on the way to some folders, once", async () => {
      const leaf = await nest("a/b/c");
      const other = await nest("a/d");
      const rows = await folders().ancestors("user:1", [
        leaf.id,
        other.id,
        leaf.id,
        "missing",
      ]);
      expect(rows.map((row) => row.path)).toEqual(["a", "a/b", "a/b/c", "a/d"]);
      await expect(folders().ancestors("user:2", [leaf.id])).resolves.toEqual(
        [],
      );
    });
  });

  describe("update", () => {
    it("rewrites the paths below names that read as LIKE patterns", async () => {
      // `_`, `%`, and `\` are patterns or escapes in a LIKE on the path.
      const tricky = await nest("a_b\\c%/child");
      await nest("axb\\c%/child");
      const top = await folders().find("user:1", tricky.parentId ?? "");
      if (!top) throw new Error("missing top");
      await folders().update("user:1", top.id, { name: "renamed" });
      await expect(paths()).resolves.toEqual([
        "axb\\c%",
        "axb\\c%/child",
        "renamed",
        "renamed/child",
      ]);
    });

    it("renames a folder and rewrites descendant paths", async () => {
      const leaf = await nest("docs/q4/plan");
      const docs = await folders().find(
        "user:1",
        (await folders().find("user:1", leaf.parentId ?? ""))?.parentId ?? "",
      );
      if (!docs) throw new Error("missing docs");
      const renamed = await folders().update("user:1", docs.id, {
        name: "files",
      });
      expect(renamed).toMatchObject({ name: "files", path: "files" });
      await expect(paths()).resolves.toEqual([
        "files",
        "files/q4",
        "files/q4/plan",
      ]);
      await expect(folders().find("user:1", leaf.id)).resolves.toMatchObject({
        path: "files/q4/plan",
        id: leaf.id,
      });
    });

    it("moves a folder without changing descendant ids", async () => {
      const leaf = await nest("docs/q4");
      const photos = await folders().create("user:1", {
        parentId: null,
        name: "photos",
      });
      const docs = await folders().find("user:1", leaf.parentId ?? "");
      if (!docs) throw new Error("missing docs");
      await folders().update("user:1", docs.id, { parentId: photos.id });
      await expect(folders().find("user:1", leaf.id)).resolves.toMatchObject({
        id: leaf.id,
        path: "photos/docs/q4",
      });
    });

    it("puts the new parent back when it is deleted during the move", async () => {
      const folder = await nest("a");
      const target = await nest("b");
      intercept((orm) => ({
        transaction: (async (run: never) => {
          await orm.deleteMany("storageFolder", {
            where: (b) => b("id", "=", target.id),
          });
          return orm.transaction(run);
        }) as Orm["transaction"],
      }));

      await expect(
        folders().update("user:1", folder.id, { parentId: target.id }),
      ).resolves.toMatchObject({ parentId: target.id, path: "b/a" });
      await expect(folders().find("user:1", target.id)).resolves.toMatchObject({
        id: target.id,
        path: "b",
      });
    });

    it("undoes a move that a concurrent move turned into a cycle", async () => {
      const a = await nest("a");
      const b = await nest("b");
      let raced = false;
      intercept((orm) => ({
        transaction: (async (run: never) => {
          if (!raced) {
            raced = true;
            // Another request moves `b` below `a` after this move checked
            // that `b` is not below `a`.
            await orm.updateMany("storageFolder", {
              where: (where) => where("id", "=", b.id),
              set: { parentId: a.id, path: "a/b" },
            });
          }
          return orm.transaction(run);
        }) as Orm["transaction"],
      }));

      await expect(
        folders().update("user:1", a.id, { parentId: b.id }),
      ).rejects.toMatchObject({ code: "CONFLICT", statusCode: 409 });

      // `a` is back at the root, so both folders are reachable again.
      await expect(folders().find("user:1", a.id)).resolves.toMatchObject({
        parentId: null,
        path: "a",
      });
      await expect(
        folders()
          .trail("user:1", b.id)
          .then((trail) => trail.map((folder) => folder.name)),
      ).resolves.toEqual(["a", "b"]);
    });

    it("moves a subfolder that was created while the folder was renamed", async () => {
      const folder = await nest("a");
      intercept((orm) => ({
        transaction: (async (run: never) => {
          // Lands after the rename read nothing below the folder.
          await orm.create("storageFolder", {
            scope: "user:1",
            parentId: folder.id,
            name: "late",
            searchName: "late",
            path: "a/late",
          });
          return orm.transaction(run);
        }) as Orm["transaction"],
      }));

      await folders().update("user:1", folder.id, { name: "renamed" });

      await expect(paths()).resolves.toEqual(["renamed", "renamed/late"]);
    });

    it("rejects a move into itself or a descendant, and a taken name", async () => {
      const leaf = await nest("docs/q4");
      const docs = await folders().find("user:1", leaf.parentId ?? "");
      if (!docs) throw new Error("missing docs");
      await expect(
        folders().update("user:1", docs.id, { parentId: docs.id }),
      ).rejects.toMatchObject({ code: "FOLDER_INVALID" });
      await expect(
        folders().update("user:1", docs.id, { parentId: leaf.id }),
      ).rejects.toMatchObject({ code: "FOLDER_INVALID" });
      await folders().create("user:1", { parentId: null, name: "photos" });
      await expect(
        folders().update("user:1", docs.id, { name: "photos" }),
      ).rejects.toMatchObject({ code: "FOLDER_EXISTS" });
      await expect(
        folders().update("user:1", "missing", { name: "x" }),
      ).rejects.toMatchObject({
        code: "FOLDER_NOT_FOUND",
      });
    });
  });

  describe("delete", () => {
    it("removes an empty folder, and a missing one is fine", async () => {
      const folder = await nest("a/b");
      await folders().delete("user:1", folder.id);
      await expect(paths()).resolves.toEqual(["a"]);
      await folders().delete("user:1", folder.id);
    });

    it("refuses a folder with child folders", async () => {
      const leaf = await nest("a/b");
      await expect(
        folders().delete("user:1", leaf.parentId ?? ""),
      ).rejects.toMatchObject({ code: "FOLDER_NOT_EMPTY" });
    });

    it.each([
      ["an active object", { status: "active" as const }],
      [
        "a pending upload",
        {
          status: "pending" as const,
          expiresAt: new Date(Date.now() + 60_000),
        },
      ],
    ])("refuses a folder with %s", async (_, values) => {
      const folder = await nest("a");
      await insertObject(client(), {
        key: "k",
        folderId: folder.id,
        ...values,
      });
      await expect(folders().delete("user:1", folder.id)).rejects.toMatchObject(
        {
          code: "FOLDER_NOT_EMPTY",
        },
      );
      await expect(paths()).resolves.toEqual(["a"]);
    });

    it("ignores deleted, expired, and other scopes' objects", async () => {
      const folder = await nest("a");
      await insertObject(client(), {
        key: "k1",
        folderId: folder.id,
        status: "deleted",
      });
      await insertObject(client(), {
        key: "k2",
        folderId: folder.id,
        status: "pending",
        expiresAt: new Date(Date.now() - 60_000),
      });
      await insertObject(client(), {
        key: "k3",
        folderId: folder.id,
        scope: "user:2",
      });

      await folders().delete("user:1", folder.id);
      await expect(paths()).resolves.toEqual([]);
    });

    it("restores the same id when an object lands during the delete", async () => {
      const folder = await nest("a");
      const store = folders();
      const real = store.delete.bind(store);
      let placed = false;
      store.delete = async (scope, id) => {
        if (!placed) {
          placed = true;
          const original = store.delete;
          store.delete = real;
          await insertObject(client(), { key: "k", folderId: id });
          await original(scope, id);
          return;
        }
        await real(scope, id);
      };
      await expect(store.delete("user:1", folder.id)).rejects.toMatchObject({
        code: "FOLDER_NOT_EMPTY",
      });
      await expect(folders().find("user:1", folder.id)).resolves.toMatchObject({
        id: folder.id,
        path: "a",
      });
    });
  });

  describe("retain", () => {
    it("puts a deleted folder back with the same id", async () => {
      const folder = await nest("a");
      await folders().delete("user:1", folder.id);
      await folders().retain(folder);
      await expect(folders().find("user:1", folder.id)).resolves.toMatchObject({
        id: folder.id,
        name: "a",
      });
      await folders().retain(folder);
      await expect(paths()).resolves.toEqual(["a"]);
    });
  });
});
