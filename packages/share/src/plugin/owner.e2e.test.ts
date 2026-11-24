import { afterEach, describe, expect, it, vi } from "vitest";
import { createShareTest, type ShareTestOptions } from "@/test/instance";
import type { ShareAuthorizeContext } from "@/types/options";

let test: Awaited<ReturnType<typeof createShareTest>> | undefined;

async function setup(options: ShareTestOptions = {}) {
  test = await createShareTest(options);
  return test;
}

afterEach(async () => {
  await test?.close();
  test = undefined;
});

const DAY = 24 * 60 * 60 * 1000;

describe("createLink", () => {
  it("links an object with the default expiry and the plugin's url", async () => {
    const { client, put, as } = await setup();
    const key = await put("1", "report.txt");

    const { link } = await client.share.createLink(
      { target: { type: "object", key }, label: "For Sam" },
      as("1"),
    );

    expect(link).toMatchObject({
      status: "active",
      label: "For Sam",
      passwordProtected: false,
      maxDownloads: null,
      downloadCount: 0,
      target: { type: "object", key, name: "report.txt", available: true },
    });
    expect(link.token).toMatch(/^[\w-]{32}$/);
    expect(link.url).toBe(`https://app.test/s/${link.token}`);
    const lifetime = Date.parse(link.expiresAt ?? "") - Date.now();
    expect(lifetime).toBeGreaterThan(6.9 * DAY);
    expect(lifetime).toBeLessThanOrEqual(7 * DAY);
  });

  it("links a folder", async () => {
    const { client, folder, as } = await setup();
    const docs = await folder("1", "Docs");

    const { link } = await client.share.createLink(
      { target: { type: "folder", folderId: docs }, expiresAt: null },
      as("1"),
    );
    expect(link).toMatchObject({
      expiresAt: null,
      target: { type: "folder", id: docs, name: "Docs", path: "Docs" },
    });
  });

  it("refuses an anonymous caller, another scope's object, and a route without downloads", async () => {
    const { client, put, as } = await setup();
    const key = await put("1", "a.txt");
    const privateKey = await put("1", "b.txt", "x", { route: "private" });

    await expect(
      client.share.createLink({ target: { type: "object", key } }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      client.share.createLink({ target: { type: "object", key } }, as("2")),
    ).rejects.toMatchObject({ code: "OBJECT_NOT_FOUND" });
    await expect(
      client.share.createLink(
        { target: { type: "object", key: privateKey } },
        as("1"),
      ),
    ).rejects.toMatchObject({ code: "FEATURE_DISABLED" });
  });

  it("refuses folder links when they are off, and another scope's folder", async () => {
    const off = await setup({ folders: false });
    const docs = await off.folder("1", "Docs");
    await expect(
      off.client.share.createLink(
        { target: { type: "folder", folderId: docs } },
        off.as("1"),
      ),
    ).rejects.toMatchObject({ code: "SHARE_FOLDER_LINKS_DISABLED" });
    await off.close();

    const on = await setup();
    const mine = await on.folder("1", "Docs");
    await expect(
      on.client.share.createLink(
        { target: { type: "folder", folderId: mine } },
        on.as("2"),
      ),
    ).rejects.toMatchObject({ code: "FOLDER_NOT_FOUND" });
  });

  it("checks expiry and password rules", async () => {
    const { client, put, as } = await setup({
      expiration: { max: 3600 },
      password: { minLength: 10 },
    });
    const key = await put("1", "a.txt");
    const target = { type: "object" as const, key };

    await expect(
      client.share.createLink(
        { target, expiresAt: new Date(Date.now() - 1000) },
        as("1"),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      client.share.createLink({ target, expiresAt: null }, as("1")),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      client.share.createLink(
        { target, expiresAt: new Date(Date.now() + 2 * 3600_000) },
        as("1"),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      client.share.createLink({ target, password: "short" }, as("1")),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    // Without `expiresAt`, the default is capped by the max.
    const { link } = await client.share.createLink(
      { target, password: "long enough!" },
      as("1"),
    );
    expect(Date.parse(link.expiresAt ?? "") - Date.now()).toBeLessThanOrEqual(
      3600_000,
    );
    expect(link.passwordProtected).toBe(true);
  });

  it("requires a password when the plugin says so", async () => {
    const { client, put, as } = await setup({ password: { required: true } });
    const key = await put("1", "a.txt");
    await expect(
      client.share.createLink({ target: { type: "object", key } }, as("1")),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("runs both authorize options and onCreated", async () => {
    const dbAuthorize = vi.fn(() => true);
    const authorize = vi.fn(() => true);
    const onCreated = vi.fn();
    const { client, put, as } = await setup({
      dbAuthorize,
      authorize,
      onCreated,
    });
    const key = await put("1", "a.txt");
    dbAuthorize.mockClear();

    const { link } = await client.share.createLink(
      { target: { type: "object", key }, maxDownloads: 3 },
      as("1"),
    );

    expect(dbAuthorize).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "plugin",
        plugin: { id: "share", action: "createLink" },
        key,
      }),
    );
    expect(authorize).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "createLink",
        scope: "user:1",
        target: expect.objectContaining({ type: "object" }),
        settings: expect.objectContaining({ maxDownloads: 3 }),
      }),
    );
    expect(onCreated).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "user:1",
        link: expect.objectContaining({ id: link.id, maxDownloads: 3 }),
      }),
    );
    expect(onCreated.mock.calls[0][0].link).not.toHaveProperty("passwordHash");

    authorize.mockReturnValue(false);
    await expect(
      client.share.createLink({ target: { type: "object", key } }, as("1")),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("listLinks", () => {
  it("pages the caller's links, newest first, and filters by target", async () => {
    const { client, put, folder, as } = await setup();
    const a = await put("1", "a.txt");
    const b = await put("1", "b.txt");
    const docs = await folder("1", "Docs");
    const first = await client.share.createLink(
      { target: { type: "object", key: a } },
      as("1"),
    );
    await client.share.createLink(
      { target: { type: "object", key: b } },
      as("1"),
    );
    await client.share.createLink(
      { target: { type: "folder", folderId: docs } },
      as("1"),
    );
    const other = await put("2", "c.txt");
    await client.share.createLink(
      { target: { type: "object", key: other } },
      as("2"),
    );

    const page1 = await client.share.listLinks({ limit: 2 }, as("1"));
    expect(page1.links.map((link) => link.target.type)).toEqual([
      "folder",
      "object",
    ]);
    expect(page1.nextCursor).not.toBeNull();
    const page2 = await client.share.listLinks(
      { limit: 2, cursor: page1.nextCursor ?? undefined },
      as("1"),
    );
    expect(page2.links.map((link) => link.id)).toEqual([first.link.id]);
    expect(page2.nextCursor).toBeNull();

    const forA = await client.share.listLinks(
      { target: { type: "object", key: a } },
      as("1"),
    );
    expect(forA.links.map((link) => link.id)).toEqual([first.link.id]);
    const forDocs = await client.share.listLinks(
      { target: { type: "folder", folderId: docs } },
      as("1"),
    );
    expect(forDocs.links).toHaveLength(1);
    const notMine = await client.share.listLinks(
      { target: { type: "object", key: other } },
      as("1"),
    );
    expect(notMine.links).toEqual([]);
  });

  it("shows authorize the object or folder a list is filtered by", async () => {
    const dbAuthorize = vi.fn(() => true);
    const authorize = vi.fn((_context: ShareAuthorizeContext) => true);
    const { client, put, folder, as } = await setup({ dbAuthorize, authorize });
    const key = await put("1", "a.txt");
    const docs = await folder("1", "Docs");

    await client.share.listLinks({}, as("1"));
    expect(authorize.mock.lastCall?.[0]).not.toHaveProperty("target");

    dbAuthorize.mockClear();
    await client.share.listLinks({ target: { type: "object", key } }, as("1"));
    expect(dbAuthorize).toHaveBeenCalledWith(
      expect.objectContaining({
        plugin: { id: "share", action: "listLinks" },
        key,
      }),
    );
    expect(authorize).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: "listLinks",
        target: { type: "object", object: expect.objectContaining({ key }) },
      }),
    );

    await client.share.listLinks(
      { target: { type: "folder", folderId: docs } },
      as("1"),
    );
    expect(dbAuthorize).toHaveBeenLastCalledWith(
      expect.objectContaining({
        plugin: { id: "share", action: "listLinks" },
        folder: "Docs",
        folderId: docs,
      }),
    );
    expect(authorize).toHaveBeenLastCalledWith(
      expect.objectContaining({
        target: {
          type: "folder",
          folder: expect.objectContaining({ id: docs }),
        },
      }),
    );

    // Lists of one target pass, a list of the whole scope does not.
    authorize.mockImplementation((context) => context.target !== undefined);
    await expect(client.share.listLinks({}, as("1"))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      client.share.listLinks({ target: { type: "object", key } }, as("1")),
    ).resolves.toMatchObject({ links: [] });

    // A filter that names nothing of the caller's lists nothing.
    authorize.mockClear();
    const other = await put("2", "b.txt");
    const notMine = await client.share.listLinks(
      { target: { type: "object", key: other } },
      as("1"),
    );
    expect(notMine.links).toEqual([]);
    const missing = await client.share.listLinks(
      { target: { type: "folder", folderId: "missing" } },
      as("1"),
    );
    expect(missing.links).toEqual([]);
    expect(authorize).not.toHaveBeenCalled();
  });

  it("hides revoked links unless asked", async () => {
    const { client, put, as } = await setup();
    const key = await put("1", "a.txt");
    const { link } = await client.share.createLink(
      { target: { type: "object", key } },
      as("1"),
    );
    await client.share.revokeLink({ id: link.id }, as("1"));

    expect((await client.share.listLinks({}, as("1"))).links).toEqual([]);
    const all = await client.share.listLinks({ includeRevoked: true }, as("1"));
    expect(all.links).toMatchObject([{ id: link.id, status: "revoked" }]);
  });
});

describe("getLink, updateLink, revokeLink", () => {
  it("changes the settings, then turns the link off for good", async () => {
    const onUpdated = vi.fn();
    const onRevoked = vi.fn();
    const { client, put, as } = await setup({ onUpdated, onRevoked });
    const key = await put("1", "a.txt");
    const { link } = await client.share.createLink(
      { target: { type: "object", key } },
      as("1"),
    );

    const expiresAt = new Date(Date.now() + DAY);
    const updated = await client.share.updateLink(
      {
        id: link.id,
        expiresAt,
        password: "a long password",
        maxDownloads: 5,
        label: "  ",
      },
      as("1"),
    );
    expect(updated.link).toMatchObject({
      expiresAt: expiresAt.toISOString(),
      passwordProtected: true,
      maxDownloads: 5,
      label: null,
    });
    expect(onUpdated).toHaveBeenCalledWith(
      expect.objectContaining({
        previous: expect.objectContaining({ passwordProtected: false }),
        link: expect.objectContaining({ passwordProtected: true }),
      }),
    );

    const cleared = await client.share.updateLink(
      { id: link.id, password: null, maxDownloads: null },
      as("1"),
    );
    expect(cleared.link).toMatchObject({
      passwordProtected: false,
      maxDownloads: null,
    });

    const revoked = await client.share.revokeLink({ id: link.id }, as("1"));
    expect(revoked.link.status).toBe("revoked");
    expect(onRevoked).toHaveBeenCalledTimes(1);
    // Revoking again returns it as it is, without the hook.
    await client.share.revokeLink({ id: link.id }, as("1"));
    expect(onRevoked).toHaveBeenCalledTimes(1);
    await expect(
      client.share.updateLink({ id: link.id, label: "x" }, as("1")),
    ).rejects.toMatchObject({ code: "SHARE_LINK_REVOKED" });
    await expect(
      client.share.getLink({ id: link.id }, as("1")),
    ).resolves.toMatchObject({ link: { status: "revoked" } });
  });

  it("hides another scope's link as not found", async () => {
    const { client, put, as } = await setup();
    const key = await put("1", "a.txt");
    const { link } = await client.share.createLink(
      { target: { type: "object", key } },
      as("1"),
    );
    for (const call of [
      () => client.share.getLink({ id: link.id }, as("2")),
      () => client.share.updateLink({ id: link.id, label: "x" }, as("2")),
      () => client.share.revokeLink({ id: link.id }, as("2")),
    ]) {
      await expect(call()).rejects.toMatchObject({
        code: "SHARE_LINK_NOT_FOUND",
      });
    }
  });

  it("reports a deleted target as unavailable", async () => {
    const { client, put, as } = await setup();
    const key = await put("1", "a.txt");
    const { link } = await client.share.createLink(
      { target: { type: "object", key } },
      as("1"),
    );
    await client.delete({ route: "files", key }, as("1"));

    const { link: after } = await client.share.getLink(
      { id: link.id },
      as("1"),
    );
    expect(after.target).toMatchObject({
      available: false,
      key: null,
      name: null,
    });
  });
});

describe("server context", () => {
  it("runs the actions in process with the caller's request", async () => {
    const { s3, put } = await setup();
    const key = await put("1", "a.txt");
    const request = new Request("https://app.test/", {
      headers: { "x-user": "1" },
    });

    const { link } = await s3.share.api.createLink(
      { target: { type: "object", key }, expiresAt: null },
      { request },
    );
    expect(link.target).toMatchObject({ key });
    await expect(
      s3.share.api.createLink({ target: { type: "object", key } }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      s3.share.api.createLink(
        // @ts-expect-error -- an unknown target type
        { target: { type: "bucket" } },
        { request },
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const stored = await s3.share.links.find(link.id);
    expect(stored).toMatchObject({ scope: "user:1", token: link.token });
    expect(stored).not.toHaveProperty("passwordHash");
    await expect(s3.share.links.count("user:1")).resolves.toBe(1);
  });

  it("prunes links to deleted files and folders, and keeps newer ones", async () => {
    const { s3, client, put, folder, as } = await setup();
    const kept = await put("1", "kept.txt");
    const gone = await put("1", "gone.txt");
    const docs = await folder("1", "Docs");
    const keep = await client.share.createLink(
      { target: { type: "object", key: kept }, expiresAt: null },
      as("1"),
    );
    const orphan = await client.share.createLink(
      { target: { type: "object", key: gone }, expiresAt: null },
      as("1"),
    );
    const folderLink = await client.share.createLink(
      { target: { type: "folder", folderId: docs }, expiresAt: null },
      as("1"),
    );
    await client.delete({ route: "files", key: gone }, as("1"));
    await client.db.deleteFolder({ id: docs }, as("1"));

    // Too recent: nothing created before `olderThan` yet.
    await expect(
      s3.share.pruneLinks({ olderThan: Date.now() - DAY }),
    ).resolves.toEqual({ pruned: 0, orphaned: 0 });

    await expect(
      s3.share.pruneLinks({ olderThan: Date.now() + 1000 }),
    ).resolves.toEqual({ pruned: 2, orphaned: 2 });
    await expect(s3.share.links.find(keep.link.id)).resolves.not.toBeNull();
    await expect(s3.share.links.find(orphan.link.id)).resolves.toBeNull();
    await expect(s3.share.links.find(folderLink.link.id)).resolves.toBeNull();
  });

  it("runs onRevoked once for concurrent revokes", async () => {
    const onRevoked = vi.fn();
    const { client, put, as } = await setup({ onRevoked });
    const key = await put("1", "a.txt");
    const { link } = await client.share.createLink(
      { target: { type: "object", key } },
      as("1"),
    );
    const results = await Promise.all([
      client.share.revokeLink({ id: link.id }, as("1")),
      client.share.revokeLink({ id: link.id }, as("1")),
    ]);
    expect(results.map((result) => result.link.status)).toEqual([
      "revoked",
      "revoked",
    ]);
    expect(onRevoked).toHaveBeenCalledTimes(1);
  });

  it("revokes every link to a target and prunes old ones", async () => {
    const { s3, client, put, as, patchLink } = await setup();
    const key = await put("1", "a.txt");
    const first = await client.share.createLink(
      { target: { type: "object", key } },
      as("1"),
    );
    await client.share.createLink({ target: { type: "object", key } }, as("1"));

    await expect(
      s3.share.links.revokeTarget({
        type: "object",
        objectId: first.link.target.id,
      }),
    ).resolves.toBe(2);
    await expect(s3.share.links.count("user:1")).resolves.toBe(0);

    await patchLink(first.link.id, { expiresAt: new Date(Date.now() - DAY) });
    await expect(
      s3.share.pruneLinks({ olderThan: Date.now() + 1000 }),
    ).resolves.toEqual({ pruned: 2, orphaned: 0 });
    await expect(
      s3.share.links.count("user:1", { includeRevoked: true }),
    ).resolves.toBe(0);
  });
});
