import { describe, expect, it } from "vitest";
import { dimahS3 } from "@dimah-s3/server";
import { db } from "./db";
import { fakeStore, sampleObject } from "../test/fakes";

function instance(store = fakeStore()) {
  return dimahS3({
    s3: { send: async () => ({}) } as never,
    defaultBucket: "bucket",
    plugins: [
      db({
        client: store,
        resolveScope: async () => "user:1",
      }),
    ],
  });
}

describe("db plugin endpoints", () => {
  it("lists objects for the resolved scope", async () => {
    const store = fakeStore({
      listByScope: async () => [sampleObject()],
      getScopeUsage: async () => ({ totalBytes: 10, objectCount: 1 }),
    });
    const s3 = instance(store);

    const res = await s3.handler(
      new Request("http://localhost/api/s3/db/objects", { method: "GET" }),
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
    expect(s3.db.objects).toBe(store);
  });

  it("rejects listing when scope is missing", async () => {
    const s3 = dimahS3({
      s3: { send: async () => ({}) } as never,
      defaultBucket: "bucket",
      plugins: [
        db({
          client: fakeStore(),
          resolveScope: async () => null,
        }),
      ],
    });

    const res = await s3.handler(
      new Request("http://localhost/api/s3/db/objects", { method: "GET" }),
    );
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({
      message: "Unauthorized",
    });
  });
});
