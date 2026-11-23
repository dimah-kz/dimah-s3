import { route, s3Error, type GuardContext } from "@dimah-s3/server";
import { createTestInstance } from "@dimah-s3/server/testing";
import { describe, expect, it, vi } from "vitest";
import { dbClient } from "@/client/db-client";
import { memoryDbClient } from "@/test/fakes";
import { db } from "./db";

/** `db()` and `dbClient()` on an in-memory bucket, through the HTTP handler. */
function setup(guard?: (context: GuardContext) => void) {
  return createTestInstance({
    ...(guard && { guard }),
    plugins: [
      db({
        client: memoryDbClient(),
        resolveScope: ({ request }) => {
          const user = request.headers.get("x-user");
          return user ? `user:${user}` : null;
        },
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
});
