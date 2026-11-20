import { s3Error } from "@dimah-s3/core";
import { UniqueConstraintError } from "fumadb";
import {
  childFolderPath,
  folderAncestors,
  FOLDER_MAX_DEPTH,
  joinFolderPath,
  normalizeFolderPath,
} from "@/folder-path";
import type { StorageFolder } from "@/types/storage-object";
import { liveObject, type DbOrm, type GetDbOrm } from "./object-store";
import { toSearchName } from "./search-name";

/** Most child folders `children` returns when `limit` is not given. */
export const DEFAULT_FOLDER_CHILDREN_LIMIT = 1000;

/** Most folders `descendants` returns when `limit` is not given. */
export const DEFAULT_FOLDER_DESCENDANTS_LIMIT = 1000;

/**
 * Most folders below the open one that a recursive listing covers. Their
 * ids go into one `in` list, well under every driver's parameter cap.
 */
export const FOLDER_SUBTREE_LIMIT = 10_000;

/** Values per `in` list when a lookup is split up. */
const IN_BATCH = 500;

/** Where a new or moved folder sits. `null` is the root. */
export type FolderPlacement = {
  parentId: string | null;
  name: string;
};

/**
 * Data access for the `storage_folder` table. A folder is its `id`. The
 * root is not a row: a top-level folder stores `parent_id` as `""`, because
 * a nullable parent cannot be unique. `path` is rewritten when the folder
 * or one of its ancestors is renamed or moved.
 */
export type StorageFolderStore = {
  /** Loads one folder of the scope. */
  find: (scope: string, id: string) => Promise<StorageFolder | null>;
  /** How many folders the scope has. */
  count: (scope: string) => Promise<number>;
  /**
   * Ids of the folders below `id` at any depth, up to
   * {@link FOLDER_SUBTREE_LIMIT}, in no order. Empty for a folder the scope
   * does not have. Lookups for the same folder that overlap share one walk.
   * @internal Recursive listings use it.
   */
  subtreeIds: (scope: string, id: string) => Promise<string[]>;
  /**
   * Direct child folders of `parentId` (`null` is the root), by name. Case
   * and accents do not count, as in the name sort of the objects.
   */
  children: (
    scope: string,
    parentId: string | null,
    options?: { limit?: number },
  ) => Promise<StorageFolder[]>;
  /**
   * The folders from the root down to `id`, including `id`.
   * @throws `FOLDER_NOT_FOUND` when the scope has no such folder.
   */
  trail: (scope: string, id: string) => Promise<StorageFolder[]>;
  /**
   * Folders below `parentId` at any depth (`null`: every folder of the
   * scope), by name, then path. With `search`, only those whose name
   * contains it, folded the way file search folds (case, accents, and
   * look-alike letters do not count). `parentId` itself is not included.
   * @throws `FOLDER_NOT_FOUND` when `parentId` is not in the scope.
   */
  descendants: (
    scope: string,
    parentId: string | null,
    options?: { search?: string; limit?: number },
  ) => Promise<StorageFolder[]>;
  /**
   * Every folder from the top level down to each of `ids`, `ids` included,
   * once each, in path order. Ids the scope does not have are skipped.
   * Draws the location of rows that come from several folders.
   */
  ancestors: (
    scope: string,
    ids: readonly string[],
  ) => Promise<StorageFolder[]>;
  /**
   * Creates `name` inside `parentId`. The parent must already exist.
   * @throws `FOLDER_NOT_FOUND` when the parent is missing.
   * @throws `FOLDER_INVALID` when the name or the resulting path is not a
   * folder path.
   * @throws `FOLDER_EXISTS` when that parent already has the name.
   */
  create: (scope: string, input: FolderPlacement) => Promise<StorageFolder>;
  /**
   * Renames `id`, moves it, or both. An omitted field stays as it is.
   * `parentId: null` moves the folder to the root. Descendants keep their
   * ids; their paths are rewritten.
   * @throws `FOLDER_NOT_FOUND` when the folder or its new parent is missing.
   * @throws `FOLDER_INVALID` when the name is not a folder name, the folder
   * would sit inside itself, or a path would be too long or too deep.
   * @throws `FOLDER_EXISTS` when the destination already has the name.
   * @throws `CONFLICT` when a concurrent move put the new parent below this
   * folder. The move is undone.
   */
  update: (
    scope: string,
    id: string,
    input: { name?: string; parentId?: string | null },
  ) => Promise<StorageFolder>;
  /**
   * Removes an empty folder. Removing a missing folder does nothing.
   * @throws `FOLDER_NOT_EMPTY` when it has child folders, or active or
   * pending objects.
   */
  delete: (scope: string, id: string) => Promise<void>;
  /**
   * Puts `folder` back when a concurrent delete removed it, with the same
   * id. An object or a subfolder written in between still points at that id.
   * @internal Writers call it after they write into a folder.
   */
  retain: (folder: StorageFolder) => Promise<void>;
};

/** `""` is how the root is stored. `null` is how the stores return it. */
function storedParent(parentId: string | null): string {
  return parentId ?? "";
}

function readParent(parentId: string): string | null {
  return parentId === "" ? null : parentId;
}

type FolderRow = {
  id: string;
  scope: string;
  parentId: string;
  name: string;
  path: string;
  createdAt: Date;
  updatedAt: Date;
};

/** `values` in runs of at most `size`. */
function batches<T>(values: readonly T[], size: number): T[][] {
  const runs: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    runs.push(values.slice(index, index + size));
  }
  return runs;
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * `folders` by folded name, then by path: the order `children` reads from
 * the database, which is the name sort of the objects.
 */
function sortByName(folders: readonly StorageFolder[]): StorageFolder[] {
  return folders
    .map((folder) => ({ folder, key: toSearchName(folder.name) }))
    .sort(
      (a, b) => compare(a.key, b.key) || compare(a.folder.path, b.folder.path),
    )
    .map(({ folder }) => folder);
}

function mapFolder(row: FolderRow): StorageFolder {
  return {
    id: row.id,
    scope: row.scope,
    parentId: readParent(row.parentId),
    name: row.name,
    path: row.path,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Creates the `storage_folder` store over `getOrm`. */
export function createFolderStore(getOrm: GetDbOrm): StorageFolderStore {
  const find = async (scope: string, id: string) => {
    const orm = await getOrm();
    const row = await orm.findFirst("storageFolder", {
      where: (b) => b.and(b("scope", "=", scope), b("id", "=", id)),
    });
    return row ? mapFolder(row) : null;
  };

  const insertFolder = async (
    orm: DbOrm,
    folder: {
      id?: string;
      scope: string;
      parentId: string | null;
      name: string;
      path: string;
      createdAt?: Date;
      updatedAt?: Date;
    },
  ) => {
    const now = new Date();
    const row = await orm.create("storageFolder", {
      ...(folder.id !== undefined && { id: folder.id }),
      scope: folder.scope,
      parentId: storedParent(folder.parentId),
      name: folder.name,
      searchName: toSearchName(folder.name),
      path: folder.path,
      createdAt: folder.createdAt ?? now,
      updatedAt: folder.updatedAt ?? now,
    });
    return mapFolder(row);
  };

  /**
   * The parent a folder would sit in, or `null` for the root.
   * @throws `FOLDER_NOT_FOUND` when `parentId` is not in the scope.
   * @throws `FOLDER_INVALID` when the folder would sit inside itself.
   */
  const destination = async (
    scope: string,
    parentId: string | null,
    folderId?: string,
  ) => {
    if (parentId === null) return null;
    if (parentId === folderId) throw s3Error("FOLDER_INVALID");
    const parent = await find(scope, parentId);
    if (!parent) throw s3Error("FOLDER_NOT_FOUND");
    if (folderId !== undefined) {
      let cursor: StorageFolder | null = parent;
      const seen = new Set<string>();
      while (cursor && !seen.has(cursor.id)) {
        if (cursor.id === folderId) throw s3Error("FOLDER_INVALID");
        seen.add(cursor.id);
        cursor = cursor.parentId ? await find(scope, cursor.parentId) : null;
      }
    }
    return parent;
  };

  const countContents = async (scope: string, id: string) => {
    const orm = await getOrm();
    const now = new Date();
    const [folders, objects] = await Promise.all([
      orm.count("storageFolder", {
        where: (b) => b.and(b("scope", "=", scope), b("parentId", "=", id)),
      }),
      orm.count("storageObject", {
        where: (b) =>
          b.and(
            b("scope", "=", scope),
            b("folderId", "=", id),
            liveObject(b, now),
          ),
      }),
    ]);
    return folders + objects;
  };

  /**
   * Every folder below `id`, level by level through `parent_id`, parents
   * before their children, at most `limit`. It never matches the path with
   * `LIKE`, which reads `%`, `_`, and `\` in a name as a pattern.
   */
  const subtree = async (
    orm: DbOrm,
    scope: string,
    id: string,
    limit = Infinity,
  ) => {
    const found: StorageFolder[] = [];
    const seen = new Set([id]);
    let level = [id];
    for (let depth = 0; depth < FOLDER_MAX_DEPTH && level.length > 0; depth++) {
      const next: string[] = [];
      for (const parents of batches(level, IN_BATCH)) {
        const rows = await orm.findMany("storageFolder", {
          where: (b) =>
            b.and(b("scope", "=", scope), b("parentId", "in", parents)),
          orderBy: [["id", "asc"]],
        });
        for (const row of rows) {
          if (seen.has(row.id)) continue;
          seen.add(row.id);
          found.push(mapFolder(row));
          next.push(row.id);
          if (found.length >= limit) return found;
        }
      }
      level = next;
    }
    return found;
  };

  /** Walks below a folder still in flight, so one listing's lookups share one. */
  const walks = new Map<string, Promise<StorageFolder[]>>();
  /** {@link subtree} up to {@link FOLDER_SUBTREE_LIMIT}, shared while in flight. */
  const sharedSubtree = (scope: string, id: string) => {
    const key = JSON.stringify([scope, id]);
    let walk = walks.get(key);
    if (!walk) {
      walk = getOrm()
        .then((orm) => subtree(orm, scope, id, FOLDER_SUBTREE_LIMIT))
        .finally(() => {
          walks.delete(key);
        });
      walks.set(key, walk);
    }
    return walk;
  };

  const retain: StorageFolderStore["retain"] = async (folder) => {
    if (await find(folder.scope, folder.id)) return;
    const orm = await getOrm();
    try {
      await insertFolder(orm, folder);
    } catch (error) {
      // A concurrent `retain` put the row back first.
      if (
        error instanceof UniqueConstraintError &&
        (await find(folder.scope, folder.id))
      ) {
        return;
      }
      throw error;
    }
  };

  /**
   * Writes where a folder sits (its name, parent, and path) and the path of
   * every folder below it, in one transaction. The folders below are read
   * inside it, and each path is joined from its parent's, so a subfolder
   * created meanwhile gets its path too.
   * @throws `FOLDER_NOT_FOUND` when the folder is gone.
   * @throws `FOLDER_INVALID` when a path below would be too long or too deep.
   * @throws `FOLDER_EXISTS` when the parent already has the name.
   */
  const place = async (
    scope: string,
    id: string,
    next: { name: string; parentId: string | null; path: string },
  ) => {
    const orm = await getOrm();
    const now = new Date();
    await orm.transaction(async (tx) => {
      const paths = new Map([[id, next.path]]);
      const below = await subtree(tx, scope, id);
      for (const child of below) {
        const above = paths.get(child.parentId ?? "");
        // `subtree` lists a parent before its children.
        if (above === undefined) continue;
        const path = joinFolderPath(above, child.name);
        if (normalizeFolderPath(path) !== path) throw s3Error("FOLDER_INVALID");
        paths.set(child.id, path);
      }
      try {
        await tx.updateMany("storageFolder", {
          where: (b) => b.and(b("scope", "=", scope), b("id", "=", id)),
          set: {
            name: next.name,
            searchName: toSearchName(next.name),
            parentId: storedParent(next.parentId),
            path: next.path,
            updatedAt: now,
          },
        });
      } catch (error) {
        // PostgreSQL aborts the transaction on this error, so it cannot
        // be followed by another query here.
        if (error instanceof UniqueConstraintError) {
          throw s3Error("FOLDER_EXISTS");
        }
        throw error;
      }
      for (const child of below) {
        const path = paths.get(child.id);
        if (path === undefined || path === child.path) continue;
        await tx.updateMany("storageFolder", {
          where: (b) => b.and(b("scope", "=", scope), b("id", "=", child.id)),
          set: { path, updatedAt: now },
        });
      }
    });
  };

  /**
   * False when walking up from `id` comes back to a folder it already
   * passed: two moves that ran at once put each folder below the other.
   */
  const reachesRoot = async (scope: string, id: string) => {
    const seen = new Set<string>();
    let cursor = await find(scope, id);
    while (cursor) {
      if (seen.has(cursor.id)) return false;
      seen.add(cursor.id);
      if (cursor.parentId === null) return true;
      cursor = await find(scope, cursor.parentId);
    }
    // A parent is missing: a delete ran at once, and `retain` puts it back.
    return true;
  };

  return {
    find,

    async count(scope) {
      const orm = await getOrm();
      return orm.count("storageFolder", {
        where: (b) => b("scope", "=", scope),
      });
    },

    async subtreeIds(scope, id) {
      const below = await sharedSubtree(scope, id);
      return below.map((folder) => folder.id);
    },

    async children(scope, parentId, options = {}) {
      const orm = await getOrm();
      const rows = await orm.findMany("storageFolder", {
        where: (b) =>
          b.and(
            b("scope", "=", scope),
            b("parentId", "=", storedParent(parentId)),
          ),
        // The folded name, like the name sort of the objects.
        orderBy: [
          ["searchName", "asc"],
          ["id", "asc"],
        ],
        limit: options.limit ?? DEFAULT_FOLDER_CHILDREN_LIMIT,
      });
      return rows.map(mapFolder);
    },

    async trail(scope, id) {
      const chain: StorageFolder[] = [];
      const seen = new Set<string>();
      let current = await find(scope, id);
      if (!current) throw s3Error("FOLDER_NOT_FOUND");
      while (current && !seen.has(current.id)) {
        seen.add(current.id);
        chain.push(current);
        if (!current.parentId || chain.length > FOLDER_MAX_DEPTH) break;
        current = await find(scope, current.parentId);
      }
      return chain.reverse();
    },

    async descendants(scope, parentId, options = {}) {
      const limit = options.limit ?? DEFAULT_FOLDER_DESCENDANTS_LIMIT;
      const needle = options.search ? toSearchName(options.search) : "";
      let folders: StorageFolder[];
      if (parentId === null) {
        const orm = await getOrm();
        const rows = await orm.findMany("storageFolder", {
          where: (b) =>
            b.and(
              b("scope", "=", scope),
              needle === "" || b("searchName", "contains", needle),
            ),
          orderBy: [["path", "asc"]],
          limit: FOLDER_SUBTREE_LIMIT,
        });
        folders = rows.map(mapFolder);
      } else {
        const [parent, below] = await Promise.all([
          find(scope, parentId),
          sharedSubtree(scope, parentId),
        ]);
        if (!parent) throw s3Error("FOLDER_NOT_FOUND");
        // A copy: the walk may be shared with another lookup.
        folders = below.filter(
          (folder) =>
            needle === "" || toSearchName(folder.name).includes(needle),
        );
      }
      // The first `limit` by name, the same below a folder and at the root.
      return sortByName(folders).slice(0, limit);
    },

    async ancestors(scope, ids) {
      if (ids.length === 0) return [];
      const orm = await getOrm();
      const byPath = new Map<string, StorageFolder>();
      for (const run of batches([...new Set(ids)], IN_BATCH)) {
        const rows = await orm.findMany("storageFolder", {
          where: (b) => b.and(b("scope", "=", scope), b("id", "in", run)),
        });
        for (const row of rows) byPath.set(row.path, mapFolder(row));
      }
      const missing = new Set<string>();
      for (const path of byPath.keys()) {
        for (const above of folderAncestors(path)) {
          if (!byPath.has(above)) missing.add(above);
        }
      }
      for (const run of batches([...missing], IN_BATCH)) {
        const rows = await orm.findMany("storageFolder", {
          where: (b) => b.and(b("scope", "=", scope), b("path", "in", run)),
        });
        for (const row of rows) byPath.set(row.path, mapFolder(row));
      }
      return [...byPath.values()].sort((a, b) =>
        a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
      );
    },

    async create(scope, input) {
      const parent = await destination(scope, input.parentId);
      const path = childFolderPath(parent?.path ?? null, input.name);
      if (path === null) throw s3Error("FOLDER_INVALID");
      const name = path.slice(path.lastIndexOf("/") + 1);
      const orm = await getOrm();
      let folder: StorageFolder;
      try {
        folder = await insertFolder(orm, {
          scope,
          parentId: input.parentId,
          name,
          path,
        });
      } catch (error) {
        // The parent already has the name.
        if (error instanceof UniqueConstraintError) {
          throw s3Error("FOLDER_EXISTS");
        }
        throw error;
      }
      // After the row, so a delete of the parent in between sees it or is
      // undone.
      if (parent) await retain(parent);
      return folder;
    },

    async update(scope, id, input) {
      const folder = await find(scope, id);
      if (!folder) throw s3Error("FOLDER_NOT_FOUND");
      const name = input.name ?? folder.name;
      const parentId =
        input.parentId === undefined ? folder.parentId : input.parentId;
      if (name === folder.name && parentId === folder.parentId) return folder;

      const parent = await destination(scope, parentId, id);
      const path = childFolderPath(parent?.path ?? null, name);
      if (path === null) throw s3Error("FOLDER_INVALID");
      const storedName = path.slice(path.lastIndexOf("/") + 1);
      await place(scope, id, { name: storedName, parentId, path });
      // After the write, so a delete of the new parent in between sees the
      // folder or is undone.
      if (parent) await retain(parent);
      if (parentId !== folder.parentId && !(await reachesRoot(scope, id))) {
        // The check above ran before a concurrent move of the new parent
        // below this folder was written. Put this folder back.
        await place(scope, id, {
          name: folder.name,
          parentId: folder.parentId,
          path: folder.path,
        }).catch(() => undefined);
        throw s3Error("CONFLICT");
      }
      const updated = await find(scope, id);
      if (!updated) throw s3Error("FOLDER_NOT_FOUND");
      return updated;
    },

    async delete(scope, id) {
      const folder = await find(scope, id);
      if (!folder) return;
      if ((await countContents(scope, id)) > 0) {
        throw s3Error("FOLDER_NOT_EMPTY");
      }
      const orm = await getOrm();
      await orm.deleteMany("storageFolder", {
        where: (b) => b.and(b("scope", "=", scope), b("id", "=", id)),
      });
      // An upload or a new subfolder may have landed between the count and
      // the delete. Writers retain the folder after they write, and this
      // check after the delete, so the same id ends up present either way.
      if ((await countContents(scope, id)) > 0) {
        await retain(folder);
        throw s3Error("FOLDER_NOT_EMPTY");
      }
    },

    retain,
  };
}
