import { describe, expect, it } from "vitest";
import { createDbStore } from "@/store/create-db-store";
import { insertObject } from "@/test/databases";
import { memoryDbClient } from "@/test/fakes";
import { createPublicStores } from "./public-stores";

function setup() {
  const database = memoryDbClient();
  const store = createDbStore(database);
  return { database, store, ...createPublicStores(store) };
}

describe("createPublicStores", () => {
  it("moves an object into a folder that exists", async () => {
    const { database, objects, folders } = setup();
    await insertObject(database, { key: "k", folderId: null });
    const folder = await folders.create("user:1", {
      parentId: null,
      name: "docs",
    });

    await expect(
      objects.update({ bucket: "b", key: "k" }, { folderId: folder.id }),
    ).resolves.toMatchObject({ folderId: folder.id });
  });

  it("rejects a missing folder before it writes", async () => {
    const { database, objects, folders } = setup();
    await insertObject(database, { key: "k", folderId: null });

    await expect(
      objects.update({ bucket: "b", key: "k" }, { folderId: "missing" }),
    ).rejects.toMatchObject({ code: "FOLDER_NOT_FOUND" });
    await expect(
      folders.create("user:1", { parentId: null, name: "a/b" }),
    ).rejects.toMatchObject({ code: "FOLDER_INVALID" });
    await expect(
      objects.update({ bucket: "b", key: "k" }, { folderId: null }),
    ).resolves.toMatchObject({ folderId: null });
  });

  it("tracks a copy in a folder that exists, and keeps the folder", async () => {
    const { objects, folders } = setup();
    const folder = await folders.create("user:1", {
      parentId: null,
      name: "drawings",
    });

    await expect(
      objects.create({
        bucket: "b",
        key: "uploads/copy/plan.pdf",
        scope: "user:1",
        route: "uploads",
        folderId: folder.id,
        filename: "plan (copy).pdf",
        size: 10,
      }),
    ).resolves.toMatchObject({ folderId: folder.id, status: "active" });
    await expect(folders.find("user:1", folder.id)).resolves.not.toBeNull();
  });

  it("refuses a copy into a folder of another scope before it writes", async () => {
    const { objects, folders } = setup();
    const theirs = await folders.create("user:2", {
      parentId: null,
      name: "drawings",
    });
    const input = {
      bucket: "b",
      key: "uploads/copy/plan.pdf",
      scope: "user:1",
      route: "uploads",
      folderId: theirs.id,
      filename: "plan.pdf",
      size: 10,
    };

    await expect(objects.create(input)).rejects.toMatchObject({
      code: "FOLDER_NOT_FOUND",
    });
    await expect(objects.find(input)).resolves.toBeNull();
    await expect(
      objects.create({ ...input, folderId: "" }),
    ).resolves.toMatchObject({ folderId: null });
  });

  it("keeps the subtree walk off the public folder store", () => {
    const { folders, store } = setup();

    expect(store.folders).toHaveProperty("subtreeIds");
    expect(folders).not.toHaveProperty("subtreeIds");
    expect(folders).toHaveProperty("descendants");
  });

  it("keeps the upload lifecycle off the public object store", () => {
    // `create` writes an active row for an object the app put there itself;
    // pending rows, confirm, and delete stay with the plugin.
    const { objects } = setup();

    expect(Object.keys(objects).sort()).toEqual([
      "count",
      "create",
      "find",
      "getUsage",
      "list",
      "update",
    ]);
  });
});
