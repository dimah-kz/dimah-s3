import { s3Error } from "@dimah-s3/core";
import type { DbStore } from "@/store/create-db-store";
import type { StorageFolderStore } from "@/store/folder-store";
import type {
  ObjectRef,
  StorageObjectStore,
  UpdateObjectInput,
} from "@/store/object-store";
import type { StorageFolder, StorageObject } from "@/types/storage-object";

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
   * `PATCH /db/object` without its access check. A `folderId` must already
   * exist in the row's scope (`FOLDER_NOT_FOUND`). With `id` or `scope`,
   * only that row changes. Returns `null` when no active row matches.
   */
  update: (
    ref: ObjectRef & { id?: string; scope?: string },
    input: UpdateObjectInput<TAttributes>,
  ) => Promise<StorageObject<TAttributes> | null>;
};

/** `s3.db.folders`: the `storage_folder` rows. The root is never stored. */
export type DbFolders = StorageFolderStore;

/** `""` is the root, the same as `null`. */
function rootId(folderId: string | null): string | null {
  return folderId === "" ? null : folderId;
}

/**
 * The folder `folderId` names in `scope`, when the move targets one.
 * `undefined` leaves the object's folder alone.
 */
async function targetFolder(
  folders: StorageFolderStore,
  scope: string,
  folderId: string | null | undefined,
): Promise<StorageFolder | null | undefined> {
  if (folderId === undefined) return undefined;
  const id = rootId(folderId);
  if (id === null) return null;
  const folder = await folders.find(scope, id);
  if (!folder) throw s3Error("FOLDER_NOT_FOUND");
  return folder;
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
        const folderId =
          input.folderId === undefined ? undefined : rootId(input.folderId);
        let folder: StorageFolder | null | undefined;
        if (typeof folderId === "string") {
          const scope = ref.scope ?? (await objects.find(ref))?.scope;
          if (!scope) return null;
          folder = await targetFolder(folders, scope, folderId);
        }
        const row = await objects.update(ref, { ...input, folderId });
        // After the move: a folder delete in between sees the row or is undone.
        if (row && folder) await folders.retain(folder);
        return row;
      },
    },
    folders,
  };
}
