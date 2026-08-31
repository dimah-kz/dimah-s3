import { describe, expect, it, vi } from "vitest";
import { dimahS3, route } from "@dimah-s3/server";
import { db } from "./db";
import { fakeStore, sampleObject } from "@/test/fakes";

function instance(
  store = fakeStore(),
  resolveScope: () => Promise<string | null> = async () => "user:1",
) {
  return dimahS3({
    client: { send: async () => ({}) } as never,
    bucket: "bucket",
    plugins: [db({ client: store, resolveScope })],
    routes: {
      uploads: route({
        upload: true,
        download: true,
        delete: true,
      }),
    },
  });
}

describe("db plugin", () => {
  it("lists objects for the resolved scope and forwards query params", async () => {
    const listByScope = vi.fn(async () => [sampleObject()]);
    const store = fakeStore({
      listByScope,
      getScopeUsage: async () => ({ totalBytes: 10, objectCount: 1 }),
    });
    const s3 = instance(store);

    const res = await s3.handler(
      new Request(
        "http://localhost/api/s3/db/objects?status=active&limit=10&offset=2",
        { method: "GET" },
      ),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      scope: "user:1",
      usage: { totalBytes: 10, objectCount: 1 },
      objects: [
        expect.objectContaining({
          id: "1",
          key: "k",
          status: "active",
        }),
      ],
      nextCursor: null,
    });
    expect(listByScope).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "user:1",
        status: "active",
        offset: 2,
      }),
    );
    expect(s3.db.objects).toBe(store);
  });

  it("returns a cursor when more rows exist than the limit", async () => {
    const listByScope = vi.fn(async () => [
      sampleObject({ id: "1" }),
      sampleObject({ id: "2", key: "k2" }),
    ]);
    const store = fakeStore({ listByScope });
    const s3 = instance(store);

    const res = await s3.handler(
      new Request("http://localhost/api/s3/db/objects?limit=1", {
        method: "GET",
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      objects: unknown[];
      nextCursor: string | null;
    };
    expect(body.objects).toHaveLength(1);
    expect(body.nextCursor).toEqual(expect.any(String));
  });

  it("returns one object by key for the resolved scope", async () => {
    const store = fakeStore({
      findByScopeKey: vi.fn(async () => sampleObject()),
    });
    const s3 = instance(store);

    const res = await s3.handler(
      new Request("http://localhost/api/s3/db/object?key=k", {
        method: "GET",
      }),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      object: { id: "1", key: "k", route: "uploads" },
    });
  });

  it("defaults list limit to 50", async () => {
    const listByScope = vi.fn(async () => []);
    const store = fakeStore({ listByScope });
    const s3 = instance(store);

    const res = await s3.handler(
      new Request("http://localhost/api/s3/db/objects", { method: "GET" }),
    );
    expect(res.status).toBe(200);
    expect(listByScope).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "user:1",
        status: "active",
      }),
    );
  });

  it("rejects a list limit above 100", async () => {
    const s3 = instance();
    const res = await s3.handler(
      new Request("http://localhost/api/s3/db/objects?limit=101", {
        method: "GET",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects listing when scope is missing", async () => {
    const s3 = instance(fakeStore(), async () => null);
    const res = await s3.handler(
      new Request("http://localhost/api/s3/db/objects", { method: "GET" }),
    );
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({
      message: "Unauthorized",
    });
  });
});
