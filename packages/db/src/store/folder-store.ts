import { s3Error } from "@dimah-s3/core";
import {
  childFolderPath,
  FOLDER_MAX_DEPTH,
  normalizeFolderPath,
} from "@/folder-path";
import type { StorageFolder } from "@/types/storage-object";
import { liveObject, type DbOrm, type GetDbOrm } from "./object-store";

/** Most child folders `children` returns when `limit` is not given. */
export const DEFAULT_FOLDER_CHILDREN_LIMIT = 1000;

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
  /** Direct child folders of `parentId` (`null` is the root), by name. */
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
   * id. An object written in between still points at that id.
   */
  retain: (folder: StorageFolder) => Promise<void>;
};

/**
 * A unique-constraint failure from PostgreSQL, SQLite, MySQL, Prisma, or the
 * memory fake. FumaDB passes the driver's error through, and Drizzle wraps it
 * in `cause`.
 */
function isUniqueViolation(error: unknown): boolean {
  for (let current = error; typeof current === "object" && current !== null;) {
    const code = "code" in current ? String(current.code) : "";
    if (code === "23505" || code === "ER_DUP_ENTRY" || code === "P2002") {
      return true;
    }
    if (current instanceof Error && /unique/i.test(current.message)) {
      return true;
    }
    current = "cause" in current ? current.cause : undefined;
  }
  return false;
}

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

  const findNamed = async (
    scope: string,
    parentId: string | null,
    name: string,
  ) => {
    const orm = await getOrm();
    const row = await orm.findFirst("storageFolder", {
      where: (b) =>
        b.and(
          b("scope", "=", scope),
          b("parentId", "=", storedParent(parentId)),
          b("name", "=", name),
        ),
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

  const descendants = async (scope: string, path: string) => {
    const orm = await getOrm();
    const rows = await orm.findMany("storageFolder", {
      where: (b) =>
        b.and(b("scope", "=", scope), b("path", "starts with", `${path}/`)),
      orderBy: [["id", "asc"]],
    });
    return rows.map(mapFolder);
  };

  const retain: StorageFolderStore["retain"] = async (folder) => {
    if (await find(folder.scope, folder.id)) return;
    const orm = await getOrm();
    try {
      await insertFolder(orm, folder);
    } catch (error) {
      if (await find(folder.scope, folder.id)) return;
      throw error;
    }
  };

  return {
    find,

    async children(scope, parentId, options = {}) {
      const orm = await getOrm();
      const rows = await orm.findMany("storageFolder", {
        where: (b) =>
          b.and(
            b("scope", "=", scope),
            b("parentId", "=", storedParent(parentId)),
          ),
        orderBy: [
          ["name", "asc"],
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

    async create(scope, input) {
      const parent = await destination(scope, input.parentId);
      const path = childFolderPath(parent?.path ?? null, input.name);
      if (path === null) throw s3Error("FOLDER_INVALID");
      const name = path.slice(path.lastIndexOf("/") + 1);
      const orm = await getOrm();
      try {
        return await insertFolder(orm, {
          scope,
          parentId: input.parentId,
          name,
          path,
        });
      } catch (error) {
        if (await findNamed(scope, input.parentId, name)) {
          throw s3Error("FOLDER_EXISTS");
        }
        throw error;
      }
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
      const below = await descendants(scope, folder.path);
      const prefix = folder.path;
      const rewritten = below.map((child) => ({
        id: child.id,
        path: `${path}${child.path.slice(prefix.length)}`,
      }));
      for (const next of [path, ...rewritten.map((child) => child.path)]) {
        if (normalizeFolderPath(next) !== next) throw s3Error("FOLDER_INVALID");
      }

      const orm = await getOrm();
      const now = new Date();
      await orm.transaction(async (tx) => {
        try {
          await tx.updateMany("storageFolder", {
            where: (b) => b.and(b("scope", "=", scope), b("id", "=", id)),
            set: {
              name: storedName,
              parentId: storedParent(parentId),
              path,
              updatedAt: now,
            },
          });
        } catch (error) {
          // PostgreSQL aborts the transaction on this error, so it cannot
          // be followed by another query here.
          if (isUniqueViolation(error)) throw s3Error("FOLDER_EXISTS");
          throw error;
        }
        for (const child of rewritten) {
          await tx.updateMany("storageFolder", {
            where: (b) => b.and(b("scope", "=", scope), b("id", "=", child.id)),
            set: { path: child.path, updatedAt: now },
          });
        }
      });
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
