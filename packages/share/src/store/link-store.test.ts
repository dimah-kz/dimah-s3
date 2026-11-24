import { describe, expect, it } from "vitest";
import { testDatabases, useTestDatabase } from "@/test/databases";
import type { CreateLinkInput } from "./link-store";
import { createShareStore } from "./create-share-store";

const DAY = 24 * 60 * 60 * 1000;

describe.each(testDatabases)("link store ($name)", (factory) => {
  const client = useTestDatabase(factory);
  const links = () => createShareStore(client()).links;

  let counter = 0;
  const input = (
    overrides: Partial<CreateLinkInput> = {},
  ): CreateLinkInput => ({
    token: `token-${(counter += 1)}-0123456789abcdef`,
    scope: "user:1",
    target: { type: "object", objectId: "o1" },
    label: null,
    passwordHash: null,
    expiresAt: null,
    maxDownloads: null,
    ...overrides,
  });

  it("creates a link and finds it by id and by token", async () => {
    const created = await links().create(
      input({ label: "For Sam", maxDownloads: 3 }),
    );
    expect(created).toMatchObject({
      scope: "user:1",
      target: { type: "object", objectId: "o1" },
      label: "For Sam",
      passwordProtected: false,
      maxDownloads: 3,
      downloadCount: 0,
      viewCount: 0,
      revokedAt: null,
    });
    await expect(links().findById(created.id)).resolves.toEqual(created);
    await expect(links().findByToken(created.token)).resolves.toEqual(created);
    await expect(links().findByToken("nope")).resolves.toBeNull();
  });

  it("refuses a token that is taken", async () => {
    const first = await links().create(input());
    await expect(
      links().create(input({ token: first.token })),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("pages a scope's links newest first, with filters", async () => {
    const created = [];
    for (const target of [
      { type: "object", objectId: "o1" },
      { type: "object", objectId: "o2" },
      { type: "folder", folderId: "f1" },
    ] as const) {
      created.push(await links().create(input({ target })));
    }
    await links().create(input({ scope: "user:2" }));

    const first = await links().list("user:1", { limit: 2 });
    const second = await links().list("user:1", {
      limit: 2,
      cursor: first.nextCursor,
    });
    const ids = [...first.links, ...second.links].map((link) => link.id);
    expect(ids.sort()).toEqual(created.map((link) => link.id).sort());
    expect(second.nextCursor).toBeNull();

    await expect(
      links().list("user:1", { objectId: "o2" }),
    ).resolves.toMatchObject({ links: [{ id: created[1].id }] });
    await expect(links().count("user:1", { folderId: "f1" })).resolves.toBe(1);
    await expect(links().count("user:1")).resolves.toBe(3);
    // An unreadable cursor starts over.
    await expect(
      links().list("user:1", { cursor: "garbage" }),
    ).resolves.toMatchObject({ links: { length: 3 } });
  });

  it("updates a live link, and leaves a revoked one alone", async () => {
    const link = await links().create(input());
    const expiresAt = new Date(Date.now() + DAY);
    await expect(
      links().update(link.id, {
        expiresAt,
        maxDownloads: 5,
        passwordHash: "hash",
      }),
    ).resolves.toMatchObject({
      expiresAt,
      maxDownloads: 5,
      passwordProtected: true,
    });

    const revoked = await links().revoke(link.id);
    expect(revoked?.revokedAt).toBeInstanceOf(Date);
    await expect(links().update(link.id, { label: "x" })).resolves.toBeNull();
    // Revoking again keeps the first time.
    await expect(links().revoke(link.id)).resolves.toMatchObject({
      revokedAt: revoked?.revokedAt,
    });
    await expect(links().count("user:1")).resolves.toBe(0);
    await expect(
      links().count("user:1", { includeRevoked: true }),
    ).resolves.toBe(1);
  });

  it("counts downloads up to the limit, one at a time", async () => {
    const link = await links().create(input({ maxDownloads: 2 }));
    const once = await links().countDownload(link);
    expect(once.downloadCount).toBe(1);
    expect(once.lastAccessedAt).toBeInstanceOf(Date);
    // A stale copy of the row still counts from the stored value.
    await expect(links().countDownload(link)).resolves.toMatchObject({
      downloadCount: 2,
    });
    await expect(links().countDownload(link)).rejects.toMatchObject({
      code: "SHARE_LINK_EXHAUSTED",
    });
  });

  it("refuses to count on a revoked or expired link", async () => {
    const revoked = await links().create(input());
    await links().revoke(revoked.id);
    await expect(links().countDownload(revoked)).rejects.toMatchObject({
      code: "SHARE_LINK_REVOKED",
    });

    const expired = await links().create(
      input({ expiresAt: new Date(Date.now() - 1000) }),
    );
    await expect(links().countDownload(expired)).rejects.toMatchObject({
      code: "SHARE_LINK_EXPIRED",
    });
  });

  it("counts a view", async () => {
    const link = await links().create(input());
    await links().countView(link);
    await expect(links().findById(link.id)).resolves.toMatchObject({
      viewCount: 1,
    });
  });

  it("revokes every link to a target", async () => {
    await links().create(input());
    await links().create(input());
    await links().create(input({ target: { type: "object", objectId: "o2" } }));
    await expect(
      links().revokeTarget({ type: "object", objectId: "o1" }),
    ).resolves.toBe(2);
    await expect(links().count("user:1")).resolves.toBe(1);
  });

  it("prunes links revoked or expired before a date", async () => {
    const live = await links().create(input());
    const old = await links().create(
      input({ expiresAt: new Date(Date.now() - DAY) }),
    );
    const revoked = await links().create(input());
    await links().revoke(revoked.id);

    await expect(links().prune(new Date(Date.now() + 1000))).resolves.toBe(2);
    await expect(links().findById(live.id)).resolves.not.toBeNull();
    await expect(links().findById(old.id)).resolves.toBeNull();
  });
});
