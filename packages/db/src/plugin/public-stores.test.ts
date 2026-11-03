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

  it("keeps the upload lifecycle off the public object store", () => {
    const { objects } = setup();

    expect(Object.keys(objects).sort()).toEqual([
      "count",
      "find",
      "getUsage",
      "list",
      "update",
    ]);
  });
});
