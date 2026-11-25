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
    expect(revoked?.revoked).toBe(true);
    expect(revoked?.record.revokedAt).toBeInstanceOf(Date);
    await expect(links().update(link.id, { label: "x" })).resolves.toBeNull();
    // Revoking again keeps the first time, and says it did nothing.
    await expect(links().revoke(link.id)).resolves.toMatchObject({
      revoked: false,
      record: { revokedAt: revoked?.record.revokedAt },
    });
    await expect(links().revoke("missing")).resolves.toBeNull();
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

  it("counts every one of concurrent views", async () => {
    const link = await links().create(input());
    await Promise.all(Array.from({ length: 6 }, () => links().countView(link)));
    await expect(links().findById(link.id)).resolves.toMatchObject({
      viewCount: 6,
    });
  });

  it("counts concurrent downloads up to the limit, and no further", async () => {
    const link = await links().create(input({ maxDownloads: 5 }));
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () => links().countDownload(link)),
    );
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(5);
    // The rest are refused for the limit, not for a lost race.
    expect(
      results.flatMap((result) =>
        result.status === "rejected"
          ? [(result.reason as { code?: string }).code]
          : [],
      ),
    ).toEqual(Array(3).fill("SHARE_LINK_EXHAUSTED"));
    await expect(links().findById(link.id)).resolves.toMatchObject({
      downloadCount: 5,
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
    await expect(links().prune(new Date(Date.now() + 1000))).resolves.toBe(0);
  });

  it("refuses to count a download after the limit changed", async () => {
    const link = await links().create(input({ maxDownloads: 5 }));
    // The owner lowers the limit after the visitor's copy was read.
    await links().update(link.id, { maxDownloads: 1 });
    await expect(links().countDownload(link)).resolves.toMatchObject({
      downloadCount: 1,
      maxDownloads: 1,
    });
    await expect(links().countDownload(link)).rejects.toMatchObject({
      code: "SHARE_LINK_EXHAUSTED",
    });
  });

  it("walks older live links by id, and deletes by id", async () => {
    const created = [];
    for (let index = 0; index < 3; index++) {
      created.push(await links().create(input()));
    }
    await links().revoke(created[1].id);
    const later = new Date(Date.now() + 1000);

    const batch = await links().listOld(later, null);
    expect(batch.map((link) => link.id).sort()).toEqual(
      [created[0].id, created[2].id].sort(),
    );
    await expect(
      links().listOld(later, batch.at(-1)?.id ?? null),
    ).resolves.toEqual([]);
    await expect(links().listOld(new Date(0), null)).resolves.toEqual([]);

    await expect(links().deleteMany([created[0].id, "missing"])).resolves.toBe(
      1,
    );
    await expect(links().deleteMany([])).resolves.toBe(0);
  });
});
