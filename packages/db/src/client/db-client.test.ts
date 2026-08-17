import { describe, expect, it, vi } from "vitest";
import { createS3Client } from "@dimah-s3/core";
import { dbClient } from "./db-client";

describe("dbClient", () => {
  it("lists objects over GET /db/objects", async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
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
});
