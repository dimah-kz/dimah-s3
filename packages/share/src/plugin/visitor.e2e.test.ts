import { s3Error } from "@dimah-s3/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isSharePublicAction } from "@/constants";
import { createShareTest, type ShareTestOptions } from "@/test/instance";
import type { ShareVisitContext } from "@/types/options";

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

/** An object link to a new file of `user:1`. */
async function objectLink(
  t: Awaited<ReturnType<typeof createShareTest>>,
  settings: {
    password?: string;
    maxDownloads?: number;
    route?: string;
  } = {},
) {
  const key = await t.put("1", "report.txt", "hello world", {
    route: settings.route,
  });
  const { link } = await t.client.share.createLink(
    {
      target: { type: "object", key },
      ...(settings.password !== undefined && { password: settings.password }),
      ...(settings.maxDownloads !== undefined && {
        maxDownloads: settings.maxDownloads,
      }),
    },
    t.as("1"),
  );
  return { key, link };
}

describe("openLink", () => {
  it("shows the file without its key, and counts a view", async () => {
    const onOpened = vi.fn();
    const t = await setup({ onOpened });
    const { key, link } = await objectLink(t);

    const opened = await t.client.share.openLink({ token: link.token });
    expect(opened.link).toMatchObject({
      type: "object",
      locked: false,
      passwordProtected: false,
      downloadsLeft: null,
      object: { name: "report.txt", size: 11, contentType: "text/plain" },
    });
    expect(JSON.stringify(opened)).not.toContain(key);
    // The file's own folder is the top of an object link.
    expect(opened.link).toMatchObject({ object: { folderId: null } });
    expect(onOpened).toHaveBeenCalledTimes(1);

    const { link: after } = await t.client.share.getLink(
      { id: link.id },
      t.as("1"),
    );
    expect(after.viewCount).toBe(1);
    expect(after.lastAccessedAt).not.toBeNull();
  });

  it("fails an unknown, revoked, expired, or deleted link with its own code", async () => {
    const t = await setup();
    await expect(
      t.client.share.openLink({ token: "x".repeat(32) }),
    ).rejects.toMatchObject({ code: "SHARE_LINK_NOT_FOUND", statusCode: 404 });

    const revoked = await objectLink(t);
    await t.client.share.revokeLink({ id: revoked.link.id }, t.as("1"));
    await expect(
      t.client.share.openLink({ token: revoked.link.token }),
    ).rejects.toMatchObject({ code: "SHARE_LINK_REVOKED", statusCode: 410 });

    const expired = await objectLink(t);
    await t.patchLink(expired.link.id, {
      expiresAt: new Date(Date.now() - DAY),
    });
    await expect(
      t.client.share.openLink({ token: expired.link.token }),
    ).rejects.toMatchObject({ code: "SHARE_LINK_EXPIRED" });

    const deleted = await objectLink(t);
    await t.client.delete({ route: "files", key: deleted.key }, t.as("1"));
    await expect(
      t.client.share.openLink({ token: deleted.link.token }),
    ).rejects.toMatchObject({ code: "SHARE_TARGET_UNAVAILABLE" });
  });
});

describe("passwords", () => {
  it("locks the link until the password is entered", async () => {
    const t = await setup();
    const { link } = await objectLink(t, { password: "open sesame" });

    const locked = await t.client.share.openLink({ token: link.token });
    expect(locked.link).toEqual({
      type: "object",
      locked: true,
      passwordProtected: true,
      expiresAt: link.expiresAt,
      downloadsLeft: null,
    });
    await expect(
      t.client.share.listShared({ token: link.token }),
    ).rejects.toMatchObject({
      code: "SHARE_PASSWORD_REQUIRED",
      statusCode: 401,
    });
    await expect(
      t.client.share.downloadShared({ token: link.token }),
    ).rejects.toMatchObject({ code: "SHARE_PASSWORD_REQUIRED" });
    await expect(
      t.client.share.unlockLink({ token: link.token, password: "wrong one" }),
    ).rejects.toMatchObject({ code: "SHARE_PASSWORD_INVALID" });

    const { access, expiresAt } = await t.client.share.unlockLink({
      token: link.token,
      password: "open sesame",
    });
    expect(Date.parse(expiresAt)).toBeGreaterThan(Date.now());
    await expect(
      t.client.share.openLink({ token: link.token, access }),
    ).resolves.toMatchObject({ link: { locked: false } });
    await expect(
      t.client.share.downloadShared({ token: link.token, access }),
    ).resolves.toMatchObject({ mode: "presign" });
  });

  it("ends every access proof when the password changes", async () => {
    const t = await setup();
    const { link } = await objectLink(t, { password: "open sesame" });
    const { access } = await t.client.share.unlockLink({
      token: link.token,
      password: "open sesame",
    });
    await t.client.share.updateLink(
      { id: link.id, password: "a new secret" },
      t.as("1"),
    );
    await expect(
      t.client.share.listShared({ token: link.token, access }),
    ).rejects.toMatchObject({ code: "SHARE_PASSWORD_REQUIRED" });

    // A proof of one link does not open another.
    const other = await objectLink(t, { password: "open sesame" });
    await expect(
      t.client.share.listShared({ token: other.link.token, access }),
    ).rejects.toMatchObject({ code: "SHARE_PASSWORD_REQUIRED" });
  });
});

describe("downloadShared", () => {
  it("hands out a short presigned URL and counts the download", async () => {
    const onDownloaded = vi.fn();
    const t = await setup({ downloadExpiresIn: 120, onDownloaded });
    const { link } = await objectLink(t);

    const sent = await t.client.share.downloadShared({
      token: link.token,
      disposition: "inline",
    });
    expect(sent).toMatchObject({
      mode: "presign",
      expiresIn: 120,
      disposition: "inline",
      downloadsLeft: null,
    });
    const url = new URL(sent.url);
    expect(url.searchParams.get("X-Amz-Expires")).toBe("120");
    expect(url.searchParams.get("response-content-disposition")).toContain(
      "report.txt",
    );
    expect(onDownloaded).toHaveBeenCalledWith(
      expect.objectContaining({
        link: expect.objectContaining({ downloadCount: 1 }),
        object: expect.objectContaining({ name: "report.txt" }),
      }),
    );
  });

  it("stops at the download limit", async () => {
    const t = await setup();
    const { link } = await objectLink(t, { maxDownloads: 2 });

    await expect(
      t.client.share.downloadShared({ token: link.token }),
    ).resolves.toMatchObject({ downloadsLeft: 1 });
    await expect(
      t.client.share.downloadShared({ token: link.token }),
    ).resolves.toMatchObject({ downloadsLeft: 0 });
    await expect(
      t.client.share.downloadShared({ token: link.token }),
    ).rejects.toMatchObject({ code: "SHARE_LINK_EXHAUSTED", statusCode: 410 });
    await expect(
      t.client.share.openLink({ token: link.token }),
    ).rejects.toMatchObject({ code: "SHARE_LINK_EXHAUSTED" });

    const { link: after } = await t.client.share.getLink(
      { id: link.id },
      t.as("1"),
    );
    expect(after).toMatchObject({ status: "exhausted", downloadCount: 2 });

    // Raising the limit opens it again.
    await t.client.share.updateLink(
      { id: link.id, maxDownloads: 3 },
      t.as("1"),
    );
    await expect(
      t.client.share.downloadShared({ token: link.token }),
    ).resolves.toMatchObject({ downloadsLeft: 0 });
  });

  it("counts every one of concurrent downloads, and no more than the limit", async () => {
    const t = await setup();
    const { link } = await objectLink(t, { maxDownloads: 3 });
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        t.client.share.downloadShared({ token: link.token }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    const { link: after } = await t.client.share.getLink(
      { id: link.id },
      t.as("1"),
    );
    expect(after.downloadCount).toBe(3);
  });

  it("refuses another id on an object link", async () => {
    const t = await setup();
    const { link } = await objectLink(t);
    await expect(
      t.client.share.downloadShared({ token: link.token, id: "other" }),
    ).rejects.toMatchObject({ code: "OBJECT_NOT_FOUND" });
  });

  it("streams through a signed /share/file URL on a proxy route", async () => {
    const t = await setup();
    const { link } = await objectLink(t, { route: "proxied" });

    const sent = await t.client.share.downloadShared({ token: link.token });
    expect(sent.mode).toBe("proxy");
    // Capped by the route's `maxExpiresIn` (60 on this route).
    expect(sent.expiresIn).toBe(60);
    const url = new URL(sent.url, "https://app.test");
    expect(url.pathname).toBe("/api/s3/share/file");

    const response = await t.s3.handler(new Request(url));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("hello world");
    expect(response.headers.get("content-disposition")).toContain("report.txt");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");

    // A forged grant, and a revoked link, stop the stream.
    url.searchParams.set("grant", `${url.searchParams.get("grant")}x`);
    const forged = await t.s3.handler(new Request(url));
    expect(forged.status).toBe(403);
    await expect(forged.json()).resolves.toMatchObject({
      code: "SHARE_DOWNLOAD_URL_INVALID",
    });

    const fresh = await t.client.share.downloadShared({ token: link.token });
    await t.client.share.revokeLink({ id: link.id }, t.as("1"));
    const revoked = await t.s3.handler(
      new Request(new URL(fresh.url, "https://app.test")),
    );
    expect(revoked.status).toBe(410);
  });
});

describe("folder links", () => {
  /**
   * `user:1` shares `Docs`, which holds `a.txt` and `Reports/q1.txt`.
   * `Other/secret.txt` sits beside it.
   */
  async function sharedDocs(t: Awaited<ReturnType<typeof createShareTest>>) {
    const docs = await t.folder("1", "Docs");
    const reports = await t.folder("1", "Reports", docs);
    const other = await t.folder("1", "Other");
    await t.put("1", "a.txt", "aaa", { folderId: docs });
    await t.put("1", "q1.txt", "q1", { folderId: reports });
    await t.put("1", "secret.txt", "no", { folderId: other });
    await t.put("1", "root.txt", "no");
    const { link } = await t.client.share.createLink(
      { target: { type: "folder", folderId: docs } },
      t.as("1"),
    );
    return { docs, reports, other, link };
  }

  it("opens on the shared folder as its top", async () => {
    const t = await setup();
    const { docs, link } = await sharedDocs(t);
    const opened = await t.client.share.openLink({ token: link.token });
    expect(opened.link).toMatchObject({
      type: "folder",
      locked: false,
      folder: { id: docs, name: "Docs", parentId: null },
    });
  });

  it("lists the top, then a subfolder with its trail", async () => {
    const t = await setup();
    const { reports, link } = await sharedDocs(t);

    const top = await t.client.share.listShared({ token: link.token });
    expect(top.objects.map((object) => object.name)).toEqual(["a.txt"]);
    expect(top.objects[0].folderId).toBeNull();
    expect(top.folders).toEqual([
      { id: reports, name: "Reports", parentId: null },
    ]);
    expect(top.trail).toEqual([]);

    const inside = await t.client.share.listShared({
      token: link.token,
      folderId: reports,
    });
    expect(inside.objects.map((object) => object.name)).toEqual(["q1.txt"]);
    expect(inside.trail).toEqual([
      { id: reports, name: "Reports", parentId: null },
    ]);
  });

  it("never opens a folder outside the share", async () => {
    const t = await setup();
    const { other, link } = await sharedDocs(t);
    await expect(
      t.client.share.listShared({ token: link.token, folderId: other }),
    ).rejects.toMatchObject({ code: "FOLDER_NOT_FOUND" });
    await expect(
      t.client.share.listShared({ token: link.token, folderId: "missing" }),
    ).rejects.toMatchObject({ code: "FOLDER_NOT_FOUND" });
  });

  it("searches every folder below, and says where each result lives", async () => {
    const t = await setup();
    const { reports, link } = await sharedDocs(t);
    await t.put("1", "q2.txt", "q2", { folderId: reports });

    const found = await t.client.share.listShared({
      token: link.token,
      search: "q",
    });
    expect(found.objects.map((object) => object.name).sort()).toEqual([
      "q1.txt",
      "q2.txt",
    ]);
    expect(found.total).toBe(2);
    expect(found.locations).toEqual([
      { id: reports, name: "Reports", parentId: null },
    ]);

    const none = await t.client.share.listShared({
      token: link.token,
      search: "secret",
    });
    expect(none.objects).toEqual([]);
  });

  it("downloads a file inside, and nothing outside", async () => {
    const t = await setup();
    const { link } = await sharedDocs(t);
    const inside = await t.client.share.listShared({
      token: link.token,
      search: "q1",
    });
    await expect(
      t.client.share.downloadShared({
        token: link.token,
        id: inside.objects[0].id,
      }),
    ).resolves.toMatchObject({ mode: "presign" });
    await expect(
      t.client.share.downloadShared({ token: link.token }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const secret = await t.s3.db.objects.list("user:1", { search: "secret" });
    await expect(
      t.client.share.downloadShared({
        token: link.token,
        id: secret.objects[0].id,
      }),
    ).rejects.toMatchObject({ code: "OBJECT_NOT_FOUND" });
  });

  it("follows a file moved out of the folder", async () => {
    const t = await setup();
    const { other, link } = await sharedDocs(t);
    const { objects } = await t.client.share.listShared({ token: link.token });
    const [file] = objects;
    const stored = await t.s3.db.objects.findById(file.id);
    await t.client.db.updateObject(
      { key: stored?.key ?? "", folderId: other },
      t.as("1"),
    );
    await expect(
      t.client.share.downloadShared({ token: link.token, id: file.id }),
    ).rejects.toMatchObject({ code: "OBJECT_NOT_FOUND" });
  });
});

describe("authorizeVisit", () => {
  it("sees the link, its target, and the folder or file each call reaches", async () => {
    const authorizeVisit = vi.fn((_context: ShareVisitContext) => true);
    const t = await setup({ authorizeVisit });
    const docs = await t.folder("1", "Docs");
    const reports = await t.folder("1", "Reports", docs);
    await t.put("1", "q1.txt", "q1", { folderId: reports });
    const { link } = await t.client.share.createLink(
      { target: { type: "folder", folderId: docs } },
      t.as("1"),
    );

    await t.client.share.openLink({ token: link.token });
    expect(authorizeVisit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: "openLink",
        link: expect.objectContaining({ id: link.id, scope: "user:1" }),
        target: {
          type: "folder",
          folder: expect.objectContaining({ id: docs }),
        },
        folder: expect.objectContaining({ id: docs }),
      }),
    );
    expect(authorizeVisit.mock.lastCall?.[0]).not.toHaveProperty("object");

    const inside = await t.client.share.listShared({
      token: link.token,
      folderId: reports,
    });
    expect(authorizeVisit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: "listShared",
        folder: expect.objectContaining({ id: reports }),
      }),
    );

    await t.client.share.downloadShared({
      token: link.token,
      id: inside.objects[0].id,
    });
    expect(authorizeVisit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: "downloadShared",
        object: expect.objectContaining({ name: "q1.txt" }),
        folder: expect.objectContaining({ id: reports }),
      }),
    );

    // An object link: the folder that holds the file, none at the root.
    const atRoot = await objectLink(t);
    await t.client.share.openLink({ token: atRoot.link.token });
    expect(authorizeVisit.mock.lastCall?.[0]).toMatchObject({
      object: { name: "report.txt" },
    });
    expect(authorizeVisit.mock.lastCall?.[0]).not.toHaveProperty("folder");
    const nested = await t.put("1", "plan.txt", "plan", { folderId: reports });
    const { link: nestedLink } = await t.client.share.createLink(
      { target: { type: "object", key: nested } },
      t.as("1"),
    );
    await t.client.share.listShared({ token: nestedLink.token });
    expect(authorizeVisit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: "listShared",
        object: expect.objectContaining({ name: "plan.txt" }),
        folder: expect.objectContaining({ id: reports }),
      }),
    );
  });

  it("answers what it refuses as unavailable, before anything is counted", async () => {
    const onOpened = vi.fn();
    const t = await setup({
      onOpened,
      // Your app's trash: a folder named `Trash`, anywhere.
      authorizeVisit: ({ folder }) =>
        !folder?.path.split("/").includes("Trash"),
    });
    const docs = await t.folder("1", "Docs");
    const trash = await t.folder("1", "Trash", docs);
    const bin = await t.folder("1", "Trash");
    await t.put("1", "old.txt", "old", { folderId: trash });
    const { link } = await t.client.share.createLink(
      { target: { type: "folder", folderId: docs } },
      t.as("1"),
    );
    const top = await t.client.share.listShared({ token: link.token });
    expect(top.folders?.map((folder) => folder.name)).toEqual(["Trash"]);
    await expect(
      t.client.share.listShared({ token: link.token, folderId: trash }),
    ).rejects.toMatchObject({
      code: "SHARE_TARGET_UNAVAILABLE",
      statusCode: 410,
    });
    const [old] = (await t.s3.db.objects.list("user:1", { search: "old" }))
      .objects;
    await expect(
      t.client.share.downloadShared({ token: link.token, id: old.id }),
    ).rejects.toMatchObject({ code: "SHARE_TARGET_UNAVAILABLE" });
    const { link: after } = await t.client.share.getLink(
      { id: link.id },
      t.as("1"),
    );
    expect(after.downloadCount).toBe(0);

    // A whole folder moved to the trash keeps its id, and its links close.
    await t.client.db.updateFolder({ id: docs, parentId: bin }, t.as("1"));
    await expect(
      t.client.share.openLink({ token: link.token }),
    ).rejects.toMatchObject({ code: "SHARE_TARGET_UNAVAILABLE" });
    expect(onOpened).toHaveBeenCalledTimes(0);
    // Refused before anything is counted.
    const { link: closed } = await t.client.share.getLink(
      { id: link.id },
      t.as("1"),
    );
    expect(closed.viewCount).toBe(0);
  });

  it("waits for the password, and stops a proxy URL handed out before", async () => {
    let allowed = true;
    const t = await setup({ authorizeVisit: () => allowed });
    const { link } = await objectLink(t, {
      password: "open sesame",
      route: "proxied",
    });
    const { access } = await t.client.share.unlockLink({
      token: link.token,
      password: "open sesame",
    });
    const sent = await t.client.share.downloadShared({
      token: link.token,
      access,
    });

    allowed = false;
    await expect(
      t.client.share.openLink({ token: link.token }),
    ).resolves.toMatchObject({ link: { locked: true } });
    await expect(
      t.client.share.openLink({ token: link.token, access }),
    ).rejects.toMatchObject({ code: "SHARE_TARGET_UNAVAILABLE" });
    const response = await t.s3.handler(
      new Request(new URL(sent.url, "https://app.test")),
    );
    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toMatchObject({
      code: "SHARE_TARGET_UNAVAILABLE",
    });
  });
});

describe("guards", () => {
  it("lets visitors through a session guard with isSharePublicAction", async () => {
    const t = await setup({
      guard: (context) => {
        if (isSharePublicAction(context)) return;
        if (!context.request.headers.get("x-user")) {
          throw s3Error("UNAUTHORIZED");
        }
      },
    });
    const { link } = await objectLink(t);

    await expect(
      t.client.share.openLink({ token: link.token }),
    ).resolves.toMatchObject({ link: { locked: false } });
    await expect(t.client.share.listLinks()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("runs visitor actions in process", async () => {
    const t = await setup();
    const { link } = await objectLink(t);
    await expect(
      t.s3.share.api.openLink({ token: link.token }),
    ).resolves.toMatchObject({ link: { type: "object" } });
    await expect(
      t.s3.share.api.listShared({ token: link.token }),
    ).resolves.toMatchObject({ objects: [{ name: "report.txt" }] });
  });
});
