import { describe, expect, it, vi } from "vitest";
import { s3Error } from "@dimah-s3/core";
import type { ObjectListFolder, UploadRequestOptions } from "@dimah-s3/react";
import {
  folderPathOf,
  folderUploadCall,
  type FolderUploadList,
} from "@/lib/folder-upload";

function dropped(path: string) {
  const file = new File(["x"], path.split("/").at(-1) ?? "file.txt");
  Object.defineProperty(file, "relativePath", { value: path });
  return file;
}

/** A list over an in-memory folder tree. Folder ids are paths. */
function folderList(existing: string[] = []) {
  const folders = new Set(existing);
  const list = {
    uploadOptions: (parent: string | null) => ({
      clientMetadata: { folder: parent ?? "" },
    }),
    listFolders: vi.fn(async (parent: string | null) =>
      [...folders]
        .filter((path) => {
          const at = path.lastIndexOf("/");
          return (at < 0 ? null : path.slice(0, at)) === parent;
        })
        .map((path) => ({ id: path, name: path.split("/").at(-1) ?? path })),
    ),
    createFolder: vi.fn(
      async (
        name: string,
        options?: { parent?: string | null },
      ): Promise<ObjectListFolder> => {
        const parent = options?.parent ?? null;
        const id = parent ? `${parent}/${name}` : name;
        if (folders.has(id)) throw s3Error("FOLDER_EXISTS");
        folders.add(id);
        return { id, name };
      },
    ),
  } satisfies FolderUploadList;
  return { list, folders };
}

async function optionsFor(
  call: ReturnType<typeof folderUploadCall>,
  file: File,
): Promise<UploadRequestOptions | undefined> {
  const input = call?.uploadOptions;
  return typeof input === "function" ? input(file) : input;
}

describe("folderPathOf", () => {
  it("reads the folders of a dropped or picked file", () => {
    expect(folderPathOf(dropped("/Photos/2026/a.png"))).toEqual([
      "Photos",
      "2026",
    ]);
    expect(folderPathOf(dropped("./a.png"))).toEqual([]);
    expect(folderPathOf(new File(["x"], "a.png"))).toEqual([]);
    const picked = new File(["x"], "b.png");
    Object.defineProperty(picked, "webkitRelativePath", {
      value: "Album/b.png",
    });
    expect(folderPathOf(picked)).toEqual(["Album"]);
  });
});

describe("folderUploadCall", () => {
  it("is undefined without uploadOptions, and flat without createFolder", async () => {
    const { list } = folderList();
    expect(
      folderUploadCall({ ...list, uploadOptions: undefined }, null),
    ).toBeUndefined();
    const flat = folderUploadCall({ ...list, createFolder: undefined }, "docs");
    expect(flat).toEqual({
      uploadOptions: { clientMetadata: { folder: "docs" } },
    });
  });

  it("creates each missing folder once and places files in them", async () => {
    const { list, folders } = folderList(["Photos"]);
    const call = folderUploadCall(list, null);

    const results = await Promise.all([
      optionsFor(call, dropped("/Photos/2026/a.png")),
      optionsFor(call, dropped("/Photos/2026/b.png")),
      optionsFor(call, dropped("/Photos/c.png")),
      optionsFor(call, dropped("./d.png")),
    ]);

    expect(results.map((options) => options?.clientMetadata?.folder)).toEqual([
      "Photos/2026",
      "Photos/2026",
      "Photos",
      "",
    ]);
    // "Photos" was there already: only its new child is created.
    expect(list.createFolder).toHaveBeenCalledExactlyOnceWith("2026", {
      parent: "Photos",
    });
    expect([...folders].sort()).toEqual(["Photos", "Photos/2026"]);
  });

  it("uses a folder another drop created in the meantime", async () => {
    const { list, folders } = folderList();
    // The first lookup misses it; the create then finds it taken.
    list.listFolders.mockResolvedValueOnce([]);
    folders.add("docs/Notes");
    const call = folderUploadCall(list, "docs");

    await expect(optionsFor(call, dropped("/Notes/a.md"))).resolves.toEqual({
      clientMetadata: { folder: "docs/Notes" },
    });
  });

  it("tries a failed folder again on the next file", async () => {
    const { list } = folderList();
    const quota = s3Error("QUOTA_EXCEEDED", { limit: "folders" });
    list.createFolder.mockRejectedValueOnce(quota);
    const call = folderUploadCall(list, null);

    await expect(optionsFor(call, dropped("/Docs/a.md"))).rejects.toBe(quota);
    await expect(optionsFor(call, dropped("/Docs/a.md"))).resolves.toEqual({
      clientMetadata: { folder: "Docs" },
    });
  });
});
