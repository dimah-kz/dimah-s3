import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { s3Error } from "@dimah-s3/core";
import type {
  ObjectListPage,
  ObjectListQueryInput,
  UseObjectListOptions,
} from "@/list/types";
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

function mockQuery() {
  return vi.fn<
    (_input: ObjectListQueryInput) => Promise<ObjectListPage<Item>>
  >();
}

function useList(options: Omit<UseObjectListOptions<Item>, "getKey">) {
  return useObjectList<Item>({ getKey: (item) => item.id, ...options });
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("useObjectList", () => {
  it("loads the first page and builds entries", async () => {
    const query = mockQuery().mockResolvedValue(
      page(["a"], {
        folders: [{ id: "photos", name: "Photos" }],
        nextCursor: "2",
      }),
    );
    const hook = renderHook(() =>
      useList({ query, getFile: (item) => ({ name: `${item.id}.txt` }) }),
    );

    expect(hook.current.isLoading).toBe(true);
    expect(hook.current.status).toBe("loading");
    await flush();

    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        parent: null,
        cursor: null,
        sort: null,
        search: "",
      }),
    );
    expect(hook.current.items).toEqual([{ id: "a" }]);
    expect(hook.current.entries).toEqual([
      {
        kind: "folder",
        key: "folder:photos",
        id: "photos",
        name: "Photos",
        folder: { id: "photos", name: "Photos" },
      },
      {
        kind: "file",
        key: "file:a",
        id: "a",
        name: "a.txt",
        item: { id: "a" },
        file: { name: "a.txt" },
      },
    ]);
    expect(hook.current.hasMore).toBe(true);
    expect(hook.current.status).toBe("ready");
    hook.unmount();
  });

  it("names a file by its key when getFile is omitted", async () => {
    const query = mockQuery().mockResolvedValue(page(["a"]));
    const hook = renderHook(() => useList({ query }));
    await flush();

    expect(hook.current.getFile({ id: "a" })).toEqual({ name: "a" });
    hook.unmount();
  });

  it("appends the next page and keeps the first page's folders", async () => {
    const query = mockQuery()
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
    const hook = renderHook(() => useList({ query }));
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

  it("ignores a second loadMore while one is in flight", async () => {
    let resolveNext!: (value: ObjectListPage<Item>) => void;
    const query = mockQuery()
      .mockResolvedValueOnce(page(["a"], { nextCursor: "2" }))
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveNext = resolve;
        }),
      );
    const hook = renderHook(() => useList({ query }));
    await flush();

    let first!: Promise<void>;
    await act(async () => {
      first = hook.current.loadMore();
      void hook.current.loadMore();
    });
    expect(hook.current.isLoadingMore).toBe(true);
    await act(async () => {
      resolveNext(page(["b"]));
      await first;
    });

    expect(query).toHaveBeenCalledTimes(2);
    expect(hook.current.items).toEqual([{ id: "a" }, { id: "b" }]);
    hook.unmount();
  });

  it("refresh reloads every loaded page and keeps rows on screen", async () => {
    let resolveSecond!: (value: ObjectListPage<Item>) => void;
    const query = mockQuery()
      .mockResolvedValueOnce(page(["a"], { nextCursor: "2" }))
      .mockResolvedValueOnce(page(["b"], { nextCursor: "3" }))
      .mockResolvedValueOnce(page(["a2"], { nextCursor: "2" }))
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveSecond = resolve;
        }),
      );
    const hook = renderHook(() => useList({ query }));
    await flush();
    await act(async () => {
      await hook.current.loadMore();
    });

    let refreshing!: Promise<void>;
    await act(async () => {
      refreshing = hook.current.refresh();
    });
    expect(hook.current.isRefreshing).toBe(true);
    expect(hook.current.items).toEqual([{ id: "a" }, { id: "b" }]);

    await act(async () => {
      resolveSecond(page(["b2"], { nextCursor: "3" }));
      await refreshing;
    });
    expect(query.mock.calls.slice(2).map(([input]) => input.cursor)).toEqual([
      null,
      "2",
    ]);
    expect(hook.current.items).toEqual([{ id: "a2" }, { id: "b2" }]);
    expect(hook.current.nextCursor).toBe("3");
    hook.unmount();
  });

  it("passes usage limits through", async () => {
    const usage = {
      totalBytes: 10,
      objectCount: 1,
      maxBytes: 100,
      maxFiles: 5,
    };
    const query = mockQuery().mockResolvedValue(page(["a"], { usage }));
    const hook = renderHook(() => useList({ query }));
    await flush();

    expect(hook.current.usage).toEqual(usage);
    hook.unmount();
  });

  it("keeps usage until a first page omits it", async () => {
    const usage = { totalBytes: 10, objectCount: 1 };
    const query = mockQuery()
      .mockResolvedValueOnce(page(["a"], { nextCursor: "2", usage }))
      .mockResolvedValueOnce(page(["b"]))
      .mockResolvedValueOnce(page(["inside"]));
    const hook = renderHook(() => useList({ query }));
    await flush();
    expect(hook.current.usage).toEqual(usage);

    await act(async () => {
      await hook.current.loadMore();
    });
    expect(hook.current.usage).toEqual(usage);

    act(() => {
      hook.current.openFolder({ id: "photos", name: "Photos" });
    });
    await flush();
    expect(hook.current.usage).toBeNull();
    hook.unmount();
  });

  it("opens a folder, clears the search, and drops the previous rows", async () => {
    let resolveFolder!: (value: ObjectListPage<Item>) => void;
    const folderPage = new Promise<ObjectListPage<Item>>((resolve) => {
      resolveFolder = resolve;
    });
    const query = mockQuery().mockImplementation((input) =>
      input.parent == null ? Promise.resolve(page(["root"])) : folderPage,
    );
    const hook = renderHook(() => useList({ query, defaultSearch: "ro" }));
    await flush();
    expect(hook.current.search).toBe("ro");

    act(() => {
      hook.current.openFolder({ id: "photos", name: "Photos" });
    });
    expect(hook.current).toMatchObject({
      parent: "photos",
      search: "",
      trail: [{ id: "photos", name: "Photos" }],
      isLoading: true,
      items: [],
    });

    await act(async () => {
      resolveFolder(page(["inside"]));
      await folderPage;
    });

    expect(query).toHaveBeenLastCalledWith(
      expect.objectContaining({ parent: "photos", cursor: null, search: "" }),
    );
    expect(hook.current.items).toEqual([{ id: "inside" }]);
    hook.unmount();
  });

  it("keeps rows on screen while a new sort or search loads", async () => {
    let resolveSorted!: (value: ObjectListPage<Item>) => void;
    const query = mockQuery()
      .mockResolvedValueOnce(page(["a", "b"]))
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveSorted = resolve;
        }),
      )
      .mockResolvedValueOnce(page(["b"]));
    const hook = renderHook(() => useList({ query }));
    await flush();

    act(() => {
      hook.current.setSort({ field: "name", direction: "desc" });
    });
    expect(hook.current.sort).toEqual({ field: "name", direction: "desc" });
    expect(hook.current.isRefreshing).toBe(true);
    expect(hook.current.items).toEqual([{ id: "a" }, { id: "b" }]);

    await flush();
    await act(async () => {
      resolveSorted(page(["b", "a"]));
      await Promise.resolve();
    });
    expect(hook.current.items).toEqual([{ id: "b" }, { id: "a" }]);

    act(() => {
      hook.current.setSearch("  b ");
    });
    await flush();
    expect(query).toHaveBeenLastCalledWith(
      expect.objectContaining({
        search: "b",
        sort: { field: "name", direction: "desc" },
      }),
    );
    expect(hook.current.search).toBe("  b ");
    expect(hook.current.items).toEqual([{ id: "b" }]);
    hook.unmount();
  });

  it("calls onSortChange and follows the controlled sort", async () => {
    const query = mockQuery().mockResolvedValue(page(["a"]));
    const onSortChange = vi.fn();
    const hook = renderHook(() => useList({ query, sort: null, onSortChange }));
    await flush();

    act(() => {
      hook.current.setSort({ field: "size", direction: "asc" });
    });
    expect(onSortChange).toHaveBeenCalledWith({
      field: "size",
      direction: "asc",
    });
    expect(hook.current.sort).toBeNull();
    hook.unmount();
  });

  it("ignores a page that resolves after the folder changes", async () => {
    let resolveRoot!: (page: ObjectListPage<Item>) => void;
    const root = new Promise<ObjectListPage<Item>>((resolve) => {
      resolveRoot = resolve;
    });
    const query = mockQuery().mockImplementation((input) =>
      input.parent == null ? root : Promise.resolve(page(["inside"])),
    );
    const hook = renderHook(() => useList({ query }));

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

  it("keeps the rows when a later page fails, and retries that page", async () => {
    const query = mockQuery()
      .mockResolvedValueOnce(page(["a"], { nextCursor: "2" }))
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(page(["b"]));
    const hook = renderHook(() => useList({ query }));
    await flush();

    await act(async () => {
      await hook.current.loadMore();
    });

    expect(hook.current.items).toEqual([{ id: "a" }]);
    expect(hook.current.error?.code).toBe("UNKNOWN_ERROR");
    expect(hook.current.error?.cause).toEqual(new Error("offline"));
    expect(hook.current.status).toBe("error");
    expect(hook.current.hasMore).toBe(true);

    await act(async () => {
      await hook.current.retry();
    });
    expect(query).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: "2" }),
    );
    expect(hook.current.items).toEqual([{ id: "a" }, { id: "b" }]);
    expect(hook.current.error).toBeNull();
    hook.unmount();
  });

  it("shows the error, not old rows, when a first page fails", async () => {
    const failure = s3Error("FORBIDDEN");
    const query = mockQuery()
      .mockResolvedValueOnce(page(["a"]))
      .mockRejectedValueOnce(failure);
    const hook = renderHook(() => useList({ query }));
    await flush();

    act(() => {
      hook.current.openFolder({ id: "photos", name: "Photos" });
    });
    await flush();

    expect(hook.current.items).toEqual([]);
    expect(hook.current.error).toBe(failure);
    expect(hook.current.isLoading).toBe(false);
    hook.unmount();
  });

  it("shows an error when the query aborts on its own", async () => {
    const abort = new DOMException("timeout", "AbortError");
    const query = mockQuery().mockRejectedValueOnce(abort);
    const hook = renderHook(() => useList({ query }));
    await flush();

    expect(hook.current.status).toBe("error");
    expect(hook.current.error?.code).toBe("UNKNOWN_ERROR");
    expect(hook.current.error?.cause).toBe(abort);

    query.mockResolvedValueOnce(page(["a"]));
    await act(async () => {
      await hook.current.retry();
    });
    expect(hook.current.status).toBe("ready");
    expect(hook.current.items).toEqual([{ id: "a" }]);
    hook.unmount();
  });

  it("edits the loaded rows without a request", async () => {
    const query = mockQuery().mockResolvedValue(page(["a", "b", "c"]));
    const hook = renderHook(() => useList({ query }));
    await flush();

    act(() => {
      hook.current.removeItems(["b"]);
    });
    expect(hook.current.items).toEqual([{ id: "a" }, { id: "c" }]);

    act(() => {
      hook.current.setItems((items) => [{ id: "z" }, ...items]);
    });
    expect(hook.current.items.map((item) => item.id)).toEqual(["z", "a", "c"]);
    expect(query).toHaveBeenCalledTimes(1);
    hook.unmount();
  });

  it("does not fetch while disabled", async () => {
    const query = mockQuery().mockResolvedValue(page(["a"]));
    const hook = renderHook(() => useList({ query, enabled: false }));
    await flush();

    expect(query).not.toHaveBeenCalled();
    expect(hook.current.status).toBe("idle");
    expect(hook.current.isLoading).toBe(false);
    hook.unmount();
  });

  it("refetches the first page when queryKey changes", async () => {
    const query = mockQuery().mockResolvedValue(page(["a"]));
    let route = "docs";
    const hook = renderHook(() => useList({ query, queryKey: [route] }));
    await flush();
    expect(query).toHaveBeenCalledTimes(1);

    route = "images";
    hook.rerender();
    expect(hook.current.isLoading).toBe(true);
    await flush();
    expect(query).toHaveBeenCalledTimes(2);
    hook.unmount();
  });

  it("goes up a folder and back to the root", async () => {
    const query = mockQuery().mockResolvedValue(page(["a"]));
    const hook = renderHook(() =>
      useList({
        query,
        defaultTrail: [
          { id: "photos", name: "Photos" },
          { id: "photos/2026", name: "2026" },
        ],
      }),
    );
    await flush();
    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({ parent: "photos/2026" }),
    );

    act(() => {
      hook.current.goUp();
    });
    expect(hook.current.parent).toBe("photos");
    expect(hook.current.trail).toEqual([{ id: "photos", name: "Photos" }]);

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

  it("adopts the trail a page returns for the open folder", async () => {
    const query = mockQuery().mockImplementation(async (input) =>
      page(["a"], {
        trail:
          input.parent === "photos" ? [{ id: "photos", name: "Photos" }] : [],
      }),
    );
    const hook = renderHook(() => useList({ query, defaultParent: "photos" }));
    await flush();

    expect(hook.current.trail).toEqual([{ id: "photos", name: "Photos" }]);
    hook.unmount();
  });

  it("follows a controlled parent", async () => {
    const query = mockQuery().mockResolvedValue(page(["a"]));
    const onParentChange = vi.fn();
    let parent: string | null = null;
    const hook = renderHook(() => useList({ query, parent, onParentChange }));
    await flush();

    act(() => {
      hook.current.openFolder({ id: "photos", name: "Photos" });
    });
    expect(onParentChange).toHaveBeenCalledWith("photos");
    expect(hook.current.parent).toBeNull();

    parent = "photos";
    hook.rerender();
    await flush();
    expect(hook.current.trail).toEqual([{ id: "photos", name: "Photos" }]);
    expect(query).toHaveBeenLastCalledWith(
      expect.objectContaining({ parent: "photos" }),
    );
    hook.unmount();
  });

  describe("source extras", () => {
    it("leaves uploadOptions and createFolder unset when the source has neither", async () => {
      const query = mockQuery().mockResolvedValue(page([]));
      const hook = renderHook(() => useList({ query }));
      await flush();

      expect(hook.current.uploadOptions).toBeUndefined();
      expect(hook.current.createFolder).toBeUndefined();
      expect(hook.current.renameFile).toBeUndefined();
      expect(hook.current.renameFolder).toBeUndefined();
      hook.unmount();
    });

    it("returns the source's uploadOptions", async () => {
      const query = mockQuery().mockResolvedValue(page([]));
      const uploadOptions = (parent: string | null) => ({
        metadata: { folder: parent ?? "" },
      });
      const hook = renderHook(() => useList({ query, uploadOptions }));
      await flush();

      expect(hook.current.uploadOptions).toBe(uploadOptions);
      hook.unmount();
    });

    it("creates a folder in the open folder and inserts it", async () => {
      const query = mockQuery().mockResolvedValue(
        page(["a"], { folders: [{ id: "docs/old", name: "old" }] }),
      );
      const createFolder = vi.fn(({ parent, name }) =>
        Promise.resolve({ id: `${parent}/${name}`, name }),
      );
      const hook = renderHook(() =>
        useList({ query, createFolder, defaultParent: "docs" }),
      );
      await flush();

      let created: unknown;
      await act(async () => {
        created = await hook.current.createFolder?.("new");
      });

      expect(createFolder).toHaveBeenCalledWith({
        parent: "docs",
        name: "new",
      });
      expect(created).toEqual({ id: "docs/new", name: "new" });
      expect(hook.current.folders).toEqual([
        { id: "docs/old", name: "old" },
        { id: "docs/new", name: "new" },
      ]);
      expect(query).toHaveBeenCalledTimes(1);
      hook.unmount();
    });

    it("does not insert the folder after the list moved to another folder", async () => {
      const query = mockQuery().mockResolvedValue(page([]));
      let resolve!: (folder: { id: string; name: string }) => void;
      const createFolder = vi.fn(
        () =>
          new Promise<{ id: string; name: string }>((done) => {
            resolve = done;
          }),
      );
      const hook = renderHook(() => useList({ query, createFolder }));
      await flush();

      let pending: Promise<unknown> | undefined;
      act(() => {
        pending = hook.current.createFolder?.("new");
      });
      act(() => {
        hook.current.openFolder({ id: "photos", name: "Photos" });
      });
      await flush();
      await act(async () => {
        resolve({ id: "new", name: "new" });
        await pending;
      });

      expect(createFolder).toHaveBeenCalledWith({ parent: null, name: "new" });
      expect(hook.current.parent).toBe("photos");
      expect(hook.current.folders).toEqual([]);
      hook.unmount();
    });

    it("rejects with an APIError when the source fails", async () => {
      const query = mockQuery().mockResolvedValue(page([]));
      const invalid = s3Error("FOLDER_INVALID");
      const createFolder = vi
        .fn()
        .mockRejectedValueOnce(invalid)
        .mockRejectedValueOnce(new Error("boom"));
      const hook = renderHook(() => useList({ query, createFolder }));
      await flush();

      await expect(hook.current.createFolder?.("x")).rejects.toBe(invalid);
      await expect(hook.current.createFolder?.("y")).rejects.toMatchObject({
        code: "UNKNOWN_ERROR",
      });
      expect(hook.current.folders).toEqual([]);
      hook.unmount();
    });

    it("replaces a renamed file and leaves the list when nothing reorders it", async () => {
      const query = mockQuery().mockResolvedValue(page(["a"]));
      const renameFile = vi.fn(async () => ({ id: "a" }));
      const hook = renderHook(() => useList({ query, renameFile }));
      await flush();

      await act(async () => {
        await hook.current.renameFile?.({ id: "a" }, "notes.txt");
      });

      expect(renameFile).toHaveBeenCalledWith({
        item: { id: "a" },
        name: "notes.txt",
      });
      expect(hook.current.items).toEqual([{ id: "a" }]);
      expect(query).toHaveBeenCalledTimes(1);
      hook.unmount();
    });

    it("does not call the source when the file name is unchanged", async () => {
      const query = mockQuery().mockResolvedValue(page(["a"]));
      const renameFile = vi.fn(async () => ({ id: "a" }));
      const hook = renderHook(() =>
        useList({
          query,
          renameFile,
          getFile: () => ({ name: "a.txt" }),
        }),
      );
      await flush();

      await act(async () => {
        await hook.current.renameFile?.({ id: "a" }, "a.txt");
      });

      expect(renameFile).not.toHaveBeenCalled();
      expect(query).toHaveBeenCalledTimes(1);
      hook.unmount();
    });

    it("reloads after a rename when the list is sorted by name or searched", async () => {
      const query = mockQuery()
        .mockResolvedValueOnce(page(["a"]))
        .mockResolvedValueOnce(page(["server"]));
      const renameFile = vi.fn(async () => ({ id: "a" }));
      const hook = renderHook(() =>
        useList({
          query,
          renameFile,
          defaultSort: { field: "name", direction: "asc" },
        }),
      );
      await flush();

      await act(async () => {
        await hook.current.renameFile?.({ id: "a" }, "b.txt");
      });

      expect(query).toHaveBeenCalledTimes(2);
      expect(hook.current.items).toEqual([{ id: "server" }]);
      hook.unmount();
    });

    it("reloads when the source returns nothing", async () => {
      const query = mockQuery()
        .mockResolvedValueOnce(page(["a"]))
        .mockResolvedValueOnce(page(["server"]));
      const renameFile = vi.fn(async () => undefined);
      const hook = renderHook(() => useList({ query, renameFile }));
      await flush();

      await act(async () => {
        await hook.current.renameFile?.({ id: "a" }, "b.txt");
      });

      expect(query).toHaveBeenCalledTimes(2);
      expect(hook.current.items).toEqual([{ id: "server" }]);
      hook.unmount();
    });

    it("does not patch a file after the list moved to another folder", async () => {
      const query = mockQuery().mockResolvedValue(page(["a"]));
      let resolve!: (item: Item) => void;
      const renameFile = vi.fn(
        () =>
          new Promise<Item>((done) => {
            resolve = done;
          }),
      );
      const hook = renderHook(() => useList({ query, renameFile }));
      await flush();

      let pending: Promise<unknown> | undefined;
      act(() => {
        pending = hook.current.renameFile?.({ id: "a" }, "b.txt");
      });
      act(() => {
        hook.current.openFolder({ id: "photos", name: "Photos" });
      });
      await flush();
      await act(async () => {
        resolve({ id: "patched" });
        await pending;
      });

      expect(hook.current.parent).toBe("photos");
      expect(hook.current.items).toEqual([{ id: "a" }]);
      expect(query).toHaveBeenCalledTimes(2);
      hook.unmount();
    });

    it("rejects a failed rename and keeps the row", async () => {
      const query = mockQuery().mockResolvedValue(page(["a"]));
      const invalid = s3Error("VALIDATION_ERROR", { issue: "File name" });
      const renameFile = vi.fn().mockRejectedValue(invalid);
      const hook = renderHook(() => useList({ query, renameFile }));
      await flush();

      await expect(
        hook.current.renameFile?.({ id: "a" }, "b.txt"),
      ).rejects.toBe(invalid);
      expect(hook.current.items).toEqual([{ id: "a" }]);
      expect(query).toHaveBeenCalledTimes(1);
      hook.unmount();
    });

    it("renames a folder row and the breadcrumb entry with that id", async () => {
      const query = mockQuery().mockResolvedValue(
        page([], { folders: [{ id: "photos", name: "Photos" }] }),
      );
      const renameFolder = vi.fn(async ({ name }: { name: string }) => ({
        id: "photos",
        name,
      }));
      const hook = renderHook(() =>
        useList({
          query,
          renameFolder,
          defaultParent: "photos",
          defaultTrail: [{ id: "photos", name: "Photos" }],
        }),
      );
      await flush();

      await act(async () => {
        await hook.current.renameFolder?.(
          { id: "photos", name: "Photos" },
          "Album",
        );
      });

      expect(renameFolder).toHaveBeenCalledWith({
        folder: { id: "photos", name: "Photos" },
        name: "Album",
      });
      expect(hook.current.folders).toEqual([{ id: "photos", name: "Album" }]);
      expect(hook.current.trail).toEqual([{ id: "photos", name: "Album" }]);
      expect(query).toHaveBeenCalledTimes(1);
      hook.unmount();
    });
  });
});
