import { isS3ErrorCode } from "@dimah-s3/core";
import type {
  ObjectListFolder,
  UploadCallOptions,
  UploadRequestOptions,
} from "@dimah-s3/react";

/** What {@link folderUploadCall} reads from a `useObjectList` return. */
export type FolderUploadList = {
  uploadOptions: ((parent: string | null) => UploadRequestOptions) | undefined;
  createFolder:
    | ((
        name: string,
        options?: { parent?: string | null },
      ) => Promise<ObjectListFolder>)
    | undefined;
  listFolders: (
    parent: string | null,
    options?: { signal?: AbortSignal },
  ) => Promise<readonly ObjectListFolder[]>;
};

/**
 * Call options for files uploaded into `parent` (`null` is the root): the
 * source's `uploadOptions` for that folder. `undefined` when the source has
 * none, so the hook's own options apply.
 *
 * When the source can create folders, a file dropped inside a folder (its
 * `relativePath`) goes into a folder of the same name below `parent`. A
 * folder that is missing is created as its first file starts, once for the
 * whole drop; one that exists, such as from an earlier drop, is used as it
 * is.
 */
export function folderUploadCall(
  list: FolderUploadList,
  parent: string | null,
): UploadCallOptions | undefined {
  const { uploadOptions, createFolder } = list;
  if (!uploadOptions) return undefined;
  if (!createFolder) return { uploadOptions: uploadOptions(parent) };
  const place = folderPlacer(list.listFolders, createFolder, parent);
  return {
    uploadOptions: (file) => {
      const path = folderPathOf(file);
      if (path.length === 0) return uploadOptions(parent);
      return place(path).then((folder) => uploadOptions(folder));
    },
  };
}

/**
 * The folder names a dropped file sits in, from the top of the drop down.
 * Empty for a file dropped on its own, picked, or pasted.
 */
export function folderPathOf(file: File): string[] {
  // Set by the drop reader. A picker that takes folders sets the other.
  const { relativePath, webkitRelativePath } = file as File & {
    relativePath?: unknown;
    webkitRelativePath?: unknown;
  };
  const path =
    typeof relativePath === "string" && relativePath !== ""
      ? relativePath
      : typeof webkitRelativePath === "string"
        ? webkitRelativePath
        : "";
  const names = path
    .split("/")
    .map((name) => name.trim())
    .filter((name) => name !== "" && name !== "." && name !== "..");
  // The last name is the file's own.
  return names.slice(0, -1);
}

/**
 * Finds or creates the folder at a path below `base`, and returns its id.
 * One lookup and one create per folder, shared by every file of the drop.
 * A failed one is tried again on the next call, as when a file retries.
 */
function folderPlacer(
  listFolders: FolderUploadList["listFolders"],
  createFolder: NonNullable<FolderUploadList["createFolder"]>,
  base: string | null,
): (path: readonly string[]) => Promise<string | null> {
  const placed = new Map<string, Promise<string | null>>();
  const listed = new Map<string | null, Promise<readonly ObjectListFolder[]>>();

  const childrenOf = (parent: string | null) => {
    let children = listed.get(parent);
    if (!children) {
      children = listFolders(parent);
      listed.set(parent, children);
      children.catch(() => listed.delete(parent));
    }
    return children;
  };

  const ensure = async (parent: string | null, name: string) => {
    const existing = folderNamed(await childrenOf(parent), name);
    if (existing) return existing.id;
    try {
      return (await createFolder(name, { parent })).id;
    } catch (error) {
      // Another drop made it in the meantime: use that one.
      if (!isS3ErrorCode(error, "FOLDER_EXISTS")) throw error;
      listed.delete(parent);
      const made = folderNamed(await childrenOf(parent), name);
      if (made) return made.id;
      throw error;
    }
  };

  const place = (path: readonly string[]): Promise<string | null> => {
    const name = path.at(-1);
    if (name === undefined) return Promise.resolve(base);
    const key = JSON.stringify(path);
    let folder = placed.get(key);
    if (!folder) {
      folder = place(path.slice(0, -1)).then((parent) => ensure(parent, name));
      placed.set(key, folder);
      folder.catch(() => placed.delete(key));
    }
    return folder;
  };
  return place;
}

/** The folder called `name`: the same spelling first, else the same letters. */
function folderNamed(
  folders: readonly ObjectListFolder[],
  name: string,
): ObjectListFolder | undefined {
  return (
    folders.find((folder) => folder.name === name) ??
    folders.find(
      (folder) =>
        folder.name.localeCompare(name, undefined, { sensitivity: "base" }) ===
        0,
    )
  );
}
