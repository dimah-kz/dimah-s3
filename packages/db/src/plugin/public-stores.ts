import { s3Error } from "@dimah-s3/core";
import { normalizeFolderPath } from "@/folder-path";
import type { DbStore } from "@/store/create-db-store";
import type { StorageFolderStore } from "@/store/folder-store";
import type {
  ObjectRef,
  StorageObjectStore,
  UpdateObjectInput,
} from "@/store/object-store";
import type { StorageObject } from "@/types/storage-object";

/**
 * `s3.db.objects`: the `storage_object` rows, for your routes, jobs, and
 * scripts. It takes the scope as an argument, so it reads any scope. It
 * never calls S3, and the upload lifecycle stays with the plugin: delete
 * files through `s3.api.delete`.
 */
export type DbObjects<TAttributes = never> = Pick<
  StorageObjectStore<TAttributes>,
  "find" | "list" | "count" | "getUsage"
> & {
  /**
   * Renames, moves, or sets the attributes of an active row, like
   * `PATCH /db/object` without its access check. A folder is validated
   * (`FOLDER_INVALID`) and created when missing. With `id` or `scope`, only
   * that row changes. Returns `null` when no active row matches.
   */
  update: (
    ref: ObjectRef & { id?: string; scope?: string },
    input: UpdateObjectInput<TAttributes>,
  ) => Promise<StorageObject<TAttributes> | null>;
};

/**
 * `s3.db.folders`: the `storage_folder` rows. Paths are validated as on the
 * HTTP endpoints (`FOLDER_INVALID`); the root (`null`) is never stored.
 */
export type DbFolders = StorageFolderStore;

/** A valid folder path, or `FOLDER_INVALID`. */
function folderPath(path: string): string {
  const normalized = normalizeFolderPath(path);
  if (normalized === null) throw s3Error("FOLDER_INVALID");
  return normalized;
}

/** The public stores over the plugin's stores. */
export function createPublicStores<TAttributes>(
  store: Pick<DbStore<TAttributes>, "objects" | "folders">,
): { objects: DbObjects<TAttributes>; folders: DbFolders } {
  const { objects, folders } = store;
  return {
    objects: {
      find: objects.find,
      list: objects.list,
      count: objects.count,
      getUsage: objects.getUsage,
      async update(ref, input) {
        const folder =
          input.folder === undefined || input.folder === null
            ? input.folder
            : folderPath(input.folder);
        const row = await objects.update(ref, { ...input, folder });
        // After the move: a folder delete in between sees the row or is undone.
        if (row && folder !== undefined) {
          await folders.ensure(row.scope, row.folder);
        }
        return row;
      },
    },
    // Async, so an invalid path is a rejection like any other failure.
    folders: {
      find: async (scope, path) => folders.find(scope, folderPath(path)),
      children: async (scope, parent, options) =>
        folders.children(
          scope,
          parent === null ? null : folderPath(parent),
          options,
        ),
      ensure: async (scope, path) =>
        folders.ensure(scope, path === null ? null : folderPath(path)),
      create: async (scope, path) => folders.create(scope, folderPath(path)),
      delete: async (scope, path) => folders.delete(scope, folderPath(path)),
    },
  };
}
