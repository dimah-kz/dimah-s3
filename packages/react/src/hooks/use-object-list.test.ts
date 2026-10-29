import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ObjectListPage, ObjectListQueryInput } from "@/list/types";
import { useObjectList } from "./use-object-list";
import { renderHook } from "@/test/render-hook";

type Item = { id: string };

function page(
  items: string[],
  extra?: Partial<ObjectListPage<Item>>,
): ObjectListPage<Item> {
  return {
    items: items.map((id) => ({ id })),
    nextCursor: null,
    ...extra,
  };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("useObjectList", () => {
  it("loads the first page", async () => {
    const query = vi.fn(async (_input: ObjectListQueryInput) =>
      page(["a"], {
        folders: [{ id: "photos", name: "Photos" }],
        nextCursor: "2",
      }),
    );
    const hook = renderHook(() => useObjectList({ query }));

    expect(hook.current.isLoading).toBe(true);
    await flush();

    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({ parent: null, cursor: null }),
    );
    expect(hook.current.items).toEqual([{ id: "a" }]);
    expect(hook.current.folders).toEqual([{ id: "photos", name: "Photos" }]);
    expect(hook.current.hasMore).toBe(true);
    expect(hook.current.isLoading).toBe(false);
    hook.unmount();
  });

  it("appends the next page and keeps the first page's folders", async () => {
    const query = vi
      .fn<(_input: ObjectListQueryInput) => Promise<ObjectListPage<Item>>>()
      .mockResolvedValueOnce(
        page(["a"], {
          folders: [{ id: "photos", name: "Photos" }],
          nextCursor: "2",
        }),
      )
      .mockResolvedValueOnce(
        page(["b"], {
          folders: [{ id: "ignored", name: "Ignored" }],
          nextCursor: null,
        }),
      );
    const hook = renderHook(() => useObjectList({ query }));
    await flush();

    await act(async () => {
      await hook.current.loadMore();
    });

    expect(query).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: "2", parent: null }),
    );
    expect(hook.current.items).toEqual([{ id: "a" }, { id: "b" }]);
    expect(hook.current.folders).toEqual([{ id: "photos", name: "Photos" }]);
    expect(hook.current.hasMore).toBe(false);
    hook.unmount();
  });

  it("keeps usage until a full reload omits it", async () => {
    const usage = { totalBytes: 10, objectCount: 1 };
    const query = vi
      .fn<(_input: ObjectListQueryInput) => Promise<ObjectListPage<Item>>>()
      .mockResolvedValueOnce(page(["a"], { nextCursor: "2", usage }))
      .mockResolvedValueOnce(page(["b"]))
      .mockResolvedValueOnce(
        page(["a", "b"], { usage: { totalBytes: 30, objectCount: 2 } }),
      )
      .mockResolvedValueOnce(page(["inside"]));
    const hook = renderHook(() => useObjectList({ query }));
    await flush();
    expect(hook.current.usage).toEqual(usage);

    await act(async () => {
      await hook.current.loadMore();
    });
    expect(hook.current.usage).toEqual(usage);

    await act(async () => {
      await hook.current.refresh();
    });
    expect(hook.current.usage).toEqual({ totalBytes: 30, objectCount: 2 });

    await act(async () => {
      hook.current.openFolder({ id: "photos", name: "Photos" });
    });
    await flush();
    expect(hook.current.usage).toBeNull();
    hook.unmount();
  });

  it("opens a folder and drops the previous page", async () => {
    let resolveFolder!: (value: ObjectListPage<Item>) => void;
    const folderPage = new Promise<ObjectListPage<Item>>((resolve) => {
      resolveFolder = resolve;
    });
    const query = vi.fn((input: ObjectListQueryInput) =>
      input.parent == null ? Promise.resolve(page(["root"])) : folderPage,
    );
    const hook = renderHook(() => useObjectList({ query }));
    await flush();

    await act(async () => {
      hook.current.openFolder({ id: "photos", name: "Photos" });
    });
    expect(hook.current).toMatchObject({
      parent: "photos",
      trail: [{ id: "photos", name: "Photos" }],
      isLoading: true,
      items: [],
    });

    await act(async () => {
      resolveFolder(page(["inside"]));
      await folderPage;
    });

    expect(query).toHaveBeenLastCalledWith(
      expect.objectContaining({ parent: "photos", cursor: null }),
    );
    expect(hook.current.items).toEqual([{ id: "inside" }]);
    hook.unmount();
  });

  it("ignores a page that resolves after the folder changes", async () => {
    let resolveRoot!: (page: ObjectListPage<Item>) => void;
    const root = new Promise<ObjectListPage<Item>>((resolve) => {
      resolveRoot = resolve;
    });
    const query = vi.fn((input: ObjectListQueryInput) =>
      input.parent == null ? root : Promise.resolve(page(["inside"])),
    );
    const hook = renderHook(() => useObjectList({ query }));

    act(() => {
      hook.current.openFolder({ id: "photos", name: "Photos" });
    });
    await flush();

    await act(async () => {
      resolveRoot(page(["stale"]));
      await root;
    });

    expect(hook.current.items).toEqual([{ id: "inside" }]);
    hook.unmount();
  });

  it("keeps the current page when a later page fails", async () => {
    const query = vi
      .fn<(_input: ObjectListQueryInput) => Promise<ObjectListPage<Item>>>()
      .mockResolvedValueOnce(page(["a"], { nextCursor: "2" }))
      .mockRejectedValueOnce(new Error("offline"));
    const hook = renderHook(() => useObjectList({ query }));
    await flush();

    await act(async () => {
      await hook.current.loadMore();
    });

    expect(hook.current.items).toEqual([{ id: "a" }]);
    expect(hook.current.error?.message).toBe("offline");
    expect(hook.current.hasMore).toBe(true);
    hook.unmount();
  });

  it("does not fetch while disabled", async () => {
    const query = vi.fn(async () => page(["a"]));
    const hook = renderHook(() => useObjectList({ query, enabled: false }));
    await flush();

    expect(query).not.toHaveBeenCalled();
    expect(hook.current.isLoading).toBe(false);
    hook.unmount();
  });

  it("refetches the first page when queryKey changes", async () => {
    const query = vi.fn(async () => page(["a"]));
    let route = "docs";
    const hook = renderHook(() => useObjectList({ query, queryKey: [route] }));
    await flush();
    expect(query).toHaveBeenCalledTimes(1);

    route = "images";
    hook.rerender();
    await flush();
    expect(query).toHaveBeenCalledTimes(2);
    hook.unmount();
  });

  it("returns to the root", async () => {
    const query = vi.fn(async () => page(["a"]));
    const hook = renderHook(() =>
      useObjectList({
        query,
        defaultParent: "photos",
        defaultTrail: [{ id: "photos", name: "Photos" }],
      }),
    );
    await flush();
    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({ parent: "photos" }),
    );

    act(() => {
      hook.current.navigate([]);
    });
    await flush();

    expect(hook.current.parent).toBeNull();
    expect(hook.current.trail).toEqual([]);
    expect(query).toHaveBeenLastCalledWith(
      expect.objectContaining({ parent: null, cursor: null }),
    );
    hook.unmount();
  });
});
