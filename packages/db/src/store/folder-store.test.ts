import { describe, expect, it } from "vitest";
import { DB_SCHEMA_VERSION } from "@/fuma-db";
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

  describe("create", () => {
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

  describe("update", () => {
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
