import { s3Error } from "@dimah-s3/core";
import { folderAncestors, folderName, parentFolderPath } from "@/folder-path";
import type { StorageFolder } from "@/types/storage-object";
import { liveObject, type DbOrm, type GetDbOrm } from "./object-store";

/** Most child folders `children` returns when `limit` is not given. */
export const DEFAULT_FOLDER_CHILDREN_LIMIT = 1000;

/**
 * Data access for the `storage_folder` table. Paths are normalized folder
 * paths (see `parseFolder`); the root (`null`) is never stored.
 */
export type StorageFolderStore = {
  /** Loads one folder. */
  find: (scope: string, path: string) => Promise<StorageFolder | null>;
  /** Direct child folders of `parent` (`null` is the root), by name. */
  children: (
    scope: string,
    parent: string | null,
    options?: { limit?: number },
  ) => Promise<StorageFolder[]>;
  /**
   * Creates `path` and every missing ancestor, so it also restores an
   * ancestor that a concurrent delete removed. Safe to call concurrently.
   * The root (`null`) needs nothing.
   */
  ensure: (scope: string, path: string | null) => Promise<void>;
  /**
   * Creates `path` and every missing ancestor.
   * @throws `CONFLICT` when the folder already exists.
   */
  create: (scope: string, path: string) => Promise<StorageFolder>;
  /**
   * Removes an empty folder. Removing a missing folder does nothing.
   * @throws `FOLDER_NOT_EMPTY` when it has child folders, or active or
   * pending objects.
   */
  delete: (scope: string, path: string) => Promise<void>;
};

function insertFolder(orm: DbOrm, scope: string, path: string) {
  return orm.create("storageFolder", {
    scope,
    path,
    parent: parentFolderPath(path),
    name: folderName(path),
    createdAt: new Date(),
  });
}

/** Creates the `storage_folder` store over `getOrm`. */
export function createFolderStore(getOrm: GetDbOrm): StorageFolderStore {
  const find = async (scope: string, path: string) => {
    const orm = await getOrm();
    return orm.findFirst("storageFolder", {
      where: (b) => b.and(b("scope", "=", scope), b("path", "=", path)),
    });
  };

  /**
   * Inserts one folder unless it exists. A concurrent insert of the same
   * folder fails on the unique `(scope, path)`; the row it wrote is read back.
   */
  const insertMissing = async (scope: string, path: string) => {
    const existing = await find(scope, path);
    if (existing) return existing;
    try {
      return await insertFolder(await getOrm(), scope, path);
    } catch (error) {
      const raced = await find(scope, path);
      if (raced) return raced;
      throw error;
    }
  };

  const ensure = async (scope: string, path: string | null) => {
    if (path === null) return;
    // Every level is checked: a delete can remove an ancestor of an
    // existing folder while another call creates it.
    for (const ancestor of folderAncestors(path)) {
      await insertMissing(scope, ancestor);
    }
  };

  return {
    find,

    async children(scope, parent, options = {}) {
      const orm = await getOrm();
      return orm.findMany("storageFolder", {
        where: (b) =>
          b.and(
            b("scope", "=", scope),
            parent === null ? b.isNull("parent") : b("parent", "=", parent),
          ),
        orderBy: [
          ["name", "asc"],
          ["id", "asc"],
        ],
        limit: options.limit ?? DEFAULT_FOLDER_CHILDREN_LIMIT,
      });
    },

    ensure,

    async create(scope, path) {
      if (await find(scope, path)) throw s3Error("CONFLICT");
      await ensure(scope, parentFolderPath(path));
      try {
        return await insertFolder(await getOrm(), scope, path);
      } catch (error) {
        if (await find(scope, path)) throw s3Error("CONFLICT");
        throw error;
      }
    },

    async delete(scope, path) {
      const orm = await getOrm();
      const now = new Date();
      const [folders, objects] = await Promise.all([
        orm.count("storageFolder", {
          where: (b) => b.and(b("scope", "=", scope), b("parent", "=", path)),
        }),
        orm.count("storageObject", {
          where: (b) =>
            b.and(
              b("scope", "=", scope),
              b("folder", "=", path),
              liveObject(b, now),
            ),
        }),
      ]);
      if (folders > 0 || objects > 0) throw s3Error("FOLDER_NOT_EMPTY");
      await orm.deleteMany("storageFolder", {
        where: (b) => b.and(b("scope", "=", scope), b("path", "=", path)),
      });
    },
  };
}
