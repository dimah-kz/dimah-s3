import { route, s3Error, type GuardContext } from "@dimah-s3/server";
import { createTestInstance } from "@dimah-s3/server/testing";
import { describe, expect, it, vi } from "vitest";
import { dbClient } from "@/client/db-client";
import { memoryDbClient } from "@/test/fakes";
import type { DbPluginOptions } from "@/types/plugin";
import { db } from "./db";

type ChangeHooks = Pick<
  DbPluginOptions,
  "onObjectUpdated" | "onFolderCreated" | "onFolderUpdated" | "onFolderDeleted"
>;

/** `db()` and `dbClient()` on an in-memory bucket, through the HTTP handler. */
function setup(
  guard?: (context: GuardContext) => void,
  hooks: ChangeHooks = {},
) {
  return createTestInstance({
    ...(guard && { guard }),
    plugins: [
      db({
        client: memoryDbClient(),
        resolveScope: ({ request }) => {
          const user = request.headers.get("x-user");
          return user ? `user:${user}` : null;
        },
        ...hooks,
      }),
    ],
    clientPlugins: [dbClient()],
    routes: { uploads: route({ upload: true, delete: true }) },
  });
}

const asUser = (user: string) => ({ headers: { "x-user": user } });

describe("db() through the test kit", () => {
  it("tracks an upload and lists it through dbClient()", async () => {
    const { client, upload } = setup();

    const { key } = await upload(
      { route: "uploads", name: "a.txt", type: "text/plain", body: "hello" },
      asUser("1"),
    );
    const page = await client.db.listObjects({ folderId: "" }, asUser("1"));

    expect(page.objects).toEqual([
      expect.objectContaining({ key, name: "a.txt", size: 5 }),
    ]);
    await expect(
      client.db.listObjects({ folderId: "" }, asUser("2")),
    ).resolves.toMatchObject({ objects: [] });
  });

  it("names the db action in the guard context", async () => {
    const actions: (string | undefined)[] = [];
    const { client } = setup(({ plugin }) => {
      actions.push(plugin?.action);
    });

    await client.db.listObjects({ folderId: "" }, asUser("1"));
    await client.db.createFolder({ name: "docs" }, asUser("1"));

    expect(actions).toEqual(["listObjects", "createFolder"]);
  });

  it("lets a guard refuse one db action", async () => {
    const guard = vi.fn((context: GuardContext) => {
      if (
        context.plugin?.id === "db" &&
        context.plugin.action === "createFolder"
      ) {
        throw s3Error("FORBIDDEN");
      }
    });
    const { client } = setup(guard);

    await expect(
      client.db.createFolder({ name: "docs" }, asUser("1")),
    ).rejects.toMatchObject({ code: "FORBIDDEN", statusCode: 403 });
    await expect(
      client.db.listObjects({ folderId: "" }, asUser("1")),
    ).resolves.toMatchObject({ folders: [] });
  });

  it("runs the change hooks once each db write is saved", async () => {
    const onObjectUpdated = vi.fn();
    const onFolderCreated = vi.fn();
    const onFolderUpdated = vi.fn();
    const onFolderDeleted = vi.fn();
    const { client, upload } = setup(undefined, {
      onObjectUpdated,
      onFolderCreated,
      onFolderUpdated,
      onFolderDeleted,
    });

    const { folder: docs } = await client.db.createFolder(
      { name: "docs" },
      asUser("1"),
    );
    expect(onFolderCreated).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "user:1",
        operation: "folder.create",
        folder: expect.objectContaining({ id: docs.id, path: "docs" }),
      }),
    );

    const { folder: drawings } = await client.db.createFolder(
      { name: "drawings" },
      asUser("1"),
    );
    await client.db.updateFolder(
      { id: drawings.id, name: "plans", parentId: docs.id },
      asUser("1"),
    );
    expect(onFolderUpdated).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "folder.update",
        before: expect.objectContaining({ path: "drawings", parentId: null }),
        after: expect.objectContaining({
          path: "docs/plans",
          parentId: docs.id,
        }),
      }),
    );

    const { key } = await upload(
      { route: "uploads", name: "a.txt", type: "text/plain", body: "hello" },
      asUser("1"),
    );
    await client.db.updateObject(
      { key, name: "b.txt", folderId: docs.id },
      asUser("1"),
    );
    expect(onObjectUpdated).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "user:1",
        operation: "update",
        before: expect.objectContaining({ name: "a.txt", folderId: null }),
        after: expect.objectContaining({ name: "b.txt", folderId: docs.id }),
      }),
    );

    await client.db.deleteFolder({ id: drawings.id }, asUser("1"));
    expect(onFolderDeleted).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "folder.delete",
        folder: expect.objectContaining({ id: drawings.id }),
        recursive: false,
      }),
    );

    // A missing folder, and a call refused before its write, run nothing.
    await client.db.deleteFolder({ id: drawings.id }, asUser("1"));
    await expect(
      client.db.updateObject({ key, name: "c.txt" }, asUser("2")),
    ).rejects.toMatchObject({ code: "OBJECT_NOT_FOUND" });
    expect(onFolderDeleted).toHaveBeenCalledTimes(1);
    expect(onObjectUpdated).toHaveBeenCalledTimes(1);
  });

  it("fails the call when a change hook throws, and keeps the change", async () => {
    const { client } = setup(undefined, {
      onFolderCreated: () => {
        throw s3Error("CONFLICT");
      },
    });

    await expect(
      client.db.createFolder({ name: "docs" }, asUser("1")),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      client.db.listObjects({ folderId: "" }, asUser("1")),
    ).resolves.toMatchObject({
      folders: [expect.objectContaining({ name: "docs" })],
    });
  });
});
