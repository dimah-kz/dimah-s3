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
  it("moves an object into a folder it creates, like PATCH /db/object", async () => {
    const { database, objects, store } = setup();
    await insertObject(database, { key: "k", folder: null });

    await expect(
      objects.update({ bucket: "b", key: "k" }, { folder: "docs/2026" }),
    ).resolves.toMatchObject({ folder: "docs/2026" });
    await expect(store.folders.find("user:1", "docs")).resolves.not.toBeNull();
    await expect(
      store.folders.find("user:1", "docs/2026"),
    ).resolves.not.toBeNull();
  });

  it("rejects an invalid folder before it writes", async () => {
    const { database, objects, folders } = setup();
    await insertObject(database, { key: "k", folder: null });

    await expect(
      objects.update({ bucket: "b", key: "k" }, { folder: "docs/../x" }),
    ).rejects.toMatchObject({ code: "FOLDER_INVALID" });
    await expect(folders.create("user:1", "a//b")).rejects.toMatchObject({
      code: "FOLDER_INVALID",
    });
    await expect(folders.ensure("user:1", "")).rejects.toMatchObject({
      code: "FOLDER_INVALID",
    });
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
