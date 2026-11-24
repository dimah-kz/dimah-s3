import { describe, expect, it, vi } from "vitest";
import type { ShareListSharedResponse } from "@/types/client";
import { downloadSharedFile, shareObjectSource } from "./share-object-source";

const signal = new AbortController().signal;

function source(page: ShareListSharedResponse) {
  const listShared = vi.fn(async () => page);
  return {
    listShared,
    source: shareObjectSource(
      { listShared },
      { token: "tok", access: "acc", limit: 500 },
    ),
  };
}

describe("shareObjectSource", () => {
  it("lists a folder with its child folders and trail", async () => {
    const { listShared, source: list } = source({
      objects: [
        {
          id: "o1",
          name: "a.txt",
          size: 3,
          contentType: "text/plain",
          updatedAt: "2026-01-01T00:00:00.000Z",
          folderId: "f1",
        },
      ],
      nextCursor: "next",
      folders: [{ id: "f2", name: "Sub", parentId: "f1" }],
      trail: [{ id: "f1", name: "Docs", parentId: null }],
    });

    const page = await list.query({
      parent: "f1",
      cursor: null,
      sort: { field: "size", direction: "desc" },
      search: "",
      signal,
    });

    expect(listShared).toHaveBeenCalledWith(
      {
        token: "tok",
        access: "acc",
        folderId: "f1",
        sort: { field: "size", direction: "desc" },
        limit: 100,
      },
      { signal },
    );
    expect(page).toEqual({
      items: expect.any(Array),
      nextCursor: "next",
      folders: [{ id: "f2", name: "Sub" }],
      trail: [{ id: "f1", name: "Docs" }],
    });
    expect(list.getId(page.items[0])).toBe("o1");
    expect(list.getFile(page.items[0])).toEqual({
      name: "a.txt",
      objectKey: "o1",
      size: 3,
      contentType: "text/plain",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("locates search results from the top of the share", async () => {
    const { source: list } = source({
      objects: [
        {
          id: "o1",
          name: "q1.txt",
          size: 2,
          contentType: null,
          updatedAt: "2026-01-01T00:00:00.000Z",
          folderId: "f2",
        },
      ],
      nextCursor: null,
      folders: [],
      trail: [],
      locations: [
        { id: "f1", name: "Reports", parentId: null },
        { id: "f2", name: "2026", parentId: "f1" },
      ],
      total: 1,
    });

    const page = await list.query({
      parent: null,
      cursor: null,
      sort: { field: "unknown", direction: "asc" },
      search: "q",
      signal,
    });
    expect(page.total).toBe(1);
    expect(list.getFile(page.items[0]).location).toEqual([
      { id: "f1", name: "Reports" },
      { id: "f2", name: "2026" },
    ]);
  });
});

describe("downloadSharedFile", () => {
  it("fetches a URL for the file and navigates to it", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { assign });
    const downloadShared = vi.fn(async () => ({
      url: "https://bucket.test/a.txt?sig",
      mode: "presign" as const,
      expiresIn: 300,
      disposition: "attachment" as const,
      downloadsLeft: null,
    }));
    try {
      await downloadSharedFile({ downloadShared }, "o1", {
        token: "tok",
        disposition: "inline",
      });
    } finally {
      vi.unstubAllGlobals();
    }
    expect(downloadShared).toHaveBeenCalledWith(
      { token: "tok", id: "o1", disposition: "inline" },
      { signal: undefined },
    );
    expect(assign).toHaveBeenCalledWith("https://bucket.test/a.txt?sig");
  });
});
