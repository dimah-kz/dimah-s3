import { describe, expect, it, vi } from "vitest";
import type { DbClientListResponse } from "@/types/storage-object";
import { dbObjectQuery } from "./db-object-query";

const page: DbClientListResponse = {
  scope: "user:1",
  usage: { totalBytes: 12, objectCount: 1 },
  objects: [
    {
      id: "1",
      bucket: "b",
      key: "docs/a.txt",
      route: "docs",
      filename: "a.txt",
      contentType: "text/plain",
      size: 12,
      declaredSize: null,
      status: "active",
      createdAt: "2024-01-01T00:00:00.000Z",
    },
  ],
  nextCursor: "cursor-2",
};

describe("dbObjectQuery", () => {
  it("maps the folder id to a key prefix and forwards the abort signal", async () => {
    const listObjects = vi.fn(async () => page);
    const controller = new AbortController();
    const query = dbObjectQuery(listObjects, {
      route: "docs",
      limit: 20,
    });

    await expect(
      query({
        parent: "docs/",
        cursor: "cursor-1",
        signal: controller.signal,
      }),
    ).resolves.toEqual({
      items: page.objects,
      nextCursor: "cursor-2",
      usage: page.usage,
    });

    expect(listObjects).toHaveBeenCalledWith(
      {
        prefix: "docs/",
        cursor: "cursor-1",
        route: "docs",
        limit: 20,
      },
      { signal: controller.signal },
    );
  });

  it("omits an empty folder and cursor", async () => {
    const listObjects = vi.fn(async () => ({
      ...page,
      nextCursor: null,
    }));
    const query = dbObjectQuery(listObjects);

    await expect(
      query({
        parent: null,
        cursor: null,
        signal: new AbortController().signal,
      }),
    ).resolves.toMatchObject({ nextCursor: null });

    expect(listObjects).toHaveBeenCalledWith({}, expect.any(Object));
  });
});
