import { describe, expect, it } from "vitest";
import { insertObject, testDatabases, useTestDatabase } from "@/test/databases";
import { createDbStore } from "./create-db-store";

describe.each(testDatabases)("folder store ($name)", (factory) => {
  const client = useTestDatabase(factory);
  const folders = () => createDbStore(client()).folders;

  const paths = async (scope = "user:1") => {
    const orm = client().orm("2.0.0");
    const rows = await orm.findMany("storageFolder", {
      where: (b) => b("scope", "=", scope),
    });
    return rows.map((row) => row.path).sort();
  };

  describe("ensure", () => {
    it("creates the folder and every ancestor", async () => {
      await folders().ensure("user:1", "a/b/c");

      await expect(paths()).resolves.toEqual(["a", "a/b", "a/b/c"]);
      await expect(folders().find("user:1", "a/b/c")).resolves.toMatchObject({
        scope: "user:1",
        path: "a/b/c",
        parent: "a/b",
        name: "c",
      });
      await expect(folders().find("user:1", "a")).resolves.toMatchObject({
        parent: null,
        name: "a",
      });
    });

    it("does nothing for the root or an existing folder", async () => {
      await folders().ensure("user:1", null);
      await expect(paths()).resolves.toEqual([]);

      await folders().ensure("user:1", "a/b");
      const before = await folders().find("user:1", "a/b");
      await folders().ensure("user:1", "a/b");
      await expect(folders().find("user:1", "a/b")).resolves.toEqual(before);
    });

    it("creates each folder once under concurrent calls", async () => {
      const store = folders();
      await Promise.all([
        ...Array.from({ length: 5 }, () => store.ensure("user:1", "a/b/c")),
        store.ensure("user:1", "a/b/d"),
        store.ensure("user:1", "a"),
      ]);
      await expect(paths()).resolves.toEqual(["a", "a/b", "a/b/c", "a/b/d"]);
    });

    it("restores an ancestor that a concurrent delete removed", async () => {
      await folders().ensure("user:1", "a/b");
      await client()
        .orm("2.0.0")
        .deleteMany("storageFolder", { where: (b) => b("path", "=", "a") });

      await folders().ensure("user:1", "a/b");
      await expect(paths()).resolves.toEqual(["a", "a/b"]);
    });

    it("keeps scopes apart", async () => {
      await folders().ensure("user:1", "a");
      await folders().ensure("user:2", "a/b");
      await expect(paths("user:1")).resolves.toEqual(["a"]);
      await expect(paths("user:2")).resolves.toEqual(["a", "a/b"]);
    });
  });

  describe("create", () => {
    it("creates a folder with its ancestors", async () => {
      await expect(folders().create("user:1", "a/b")).resolves.toMatchObject({
        path: "a/b",
        parent: "a",
        name: "b",
      });
      await expect(paths()).resolves.toEqual(["a", "a/b"]);
    });

    it("rejects an existing folder", async () => {
      await folders().ensure("user:1", "a/b");
      await expect(folders().create("user:1", "a")).rejects.toMatchObject({
        code: "CONFLICT",
      });
      await expect(folders().create("user:1", "a/b")).rejects.toMatchObject({
        code: "CONFLICT",
      });
    });

    it("lets one of several concurrent creates win", async () => {
      const store = folders();
      const results = await Promise.allSettled(
        Array.from({ length: 4 }, () => store.create("user:1", "a/b")),
      );

      const reasons = results.flatMap((result) =>
        result.status === "rejected" ? [result.reason] : [],
      );
      expect(reasons).toEqual(
        Array.from({ length: 3 }, () =>
          expect.objectContaining({ code: "CONFLICT" }),
        ),
      );
      await expect(paths()).resolves.toEqual(["a", "a/b"]);
    });
  });

  describe("children", () => {
    it("lists the direct children of a folder by name", async () => {
      for (const path of ["b", "a/z", "a/y/deep", "c", "a/x"]) {
        await folders().ensure("user:1", path);
      }
      await folders().ensure("user:2", "d");
      const names = async (parent: string | null, limit?: number) =>
        (await folders().children("user:1", parent, { limit })).map(
          (folder) => folder.path,
        );

      await expect(names(null)).resolves.toEqual(["a", "b", "c"]);
      await expect(names("a")).resolves.toEqual(["a/x", "a/y", "a/z"]);
      await expect(names("a", 2)).resolves.toEqual(["a/x", "a/y"]);
      await expect(names("b")).resolves.toEqual([]);
    });
  });

  describe("delete", () => {
    it("removes an empty folder, and a missing one is fine", async () => {
      await folders().ensure("user:1", "a/b");
      await folders().delete("user:1", "a/b");
      await expect(paths()).resolves.toEqual(["a"]);
      await folders().delete("user:1", "a/b");
    });

    it("refuses a folder with child folders", async () => {
      await folders().ensure("user:1", "a/b");
      await expect(folders().delete("user:1", "a")).rejects.toMatchObject({
        code: "FOLDER_NOT_EMPTY",
      });
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
      await folders().ensure("user:1", "a");
      await insertObject(client(), { key: "k", folder: "a", ...values });
      await expect(folders().delete("user:1", "a")).rejects.toMatchObject({
        code: "FOLDER_NOT_EMPTY",
      });
      await expect(paths()).resolves.toEqual(["a"]);
    });

    it("ignores deleted, expired, and other scopes' objects", async () => {
      await folders().ensure("user:1", "a");
      await insertObject(client(), {
        key: "k1",
        folder: "a",
        status: "deleted",
      });
      await insertObject(client(), {
        key: "k2",
        folder: "a",
        status: "pending",
        expiresAt: new Date(Date.now() - 60_000),
      });
      await insertObject(client(), { key: "k3", folder: "a", scope: "user:2" });

      await folders().delete("user:1", "a");
      await expect(paths()).resolves.toEqual([]);
    });
  });
});
