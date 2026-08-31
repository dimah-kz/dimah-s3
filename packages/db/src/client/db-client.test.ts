import { describe, expect, it, vi } from "vitest";
import { createS3Client } from "@dimah-s3/core";
import { dbClient } from "./db-client";

describe("dbClient", () => {
  it("lists objects over GET /db/objects", async () => {
    const fetch = vi.fn(async (input: string | URL | Request) => {
      expect(String(input)).toContain("/db/objects");
      return new Response(
        JSON.stringify({
          scope: "user:1",
          usage: { totalBytes: 0, objectCount: 0 },
          objects: [],
        }),
        { headers: { "content-type": "application/json" } },
      );
    });

    const api = createS3Client({
      fetch,
      plugins: [dbClient()],
    });

    await expect(api.db.listObjects({ limit: 10 })).resolves.toMatchObject({
      scope: "user:1",
      objects: [],
    });
  });

  it("loads one object over GET /db/object", async () => {
    const fetch = vi.fn(async (input: string | URL | Request) => {
      expect(String(input)).toContain("/db/object");
      return new Response(
        JSON.stringify({
          object: {
            id: "1",
            bucket: "b",
            key: "k",
            route: "uploads",
            filename: "a.txt",
            contentType: "text/plain",
            size: 10,
            declaredSize: null,
            status: "active",
            createdAt: "2024-01-01T00:00:00.000Z",
          },
        }),
        { headers: { "content-type": "application/json" } },
      );
    });

    const api = createS3Client({
      fetch,
      plugins: [dbClient()],
    });

    await expect(api.db.getObject({ key: "k" })).resolves.toMatchObject({
      object: { key: "k", route: "uploads" },
    });
  });
});
