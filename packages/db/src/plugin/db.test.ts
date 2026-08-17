import { describe, expect, it, vi } from "vitest";
import { dimahS3 } from "@dimah-s3/server";
import { db } from "./db";
import { fakeStore, sampleObject } from "../test/fakes";

function instance(
  store = fakeStore(),
  resolveScope: () => Promise<string | null> = async () => "user:1",
) {
  return dimahS3({
    s3: { send: async () => ({}) } as never,
    defaultBucket: "bucket",
    plugins: [db({ client: store, resolveScope })],
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
    });
    expect(listByScope).toHaveBeenCalledWith({
      scope: "user:1",
      status: "active",
      limit: 10,
      offset: 2,
    });
    expect(s3.db.objects).toBe(store);
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
