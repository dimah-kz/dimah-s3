import type { DbUsage } from "@/types/client";
import type { StorageFolderStore } from "@/store/folder-store";
import type { StorageObjectStore } from "@/store/object-store";

/** One folder and the parent it sits in. `parentId` `null` is the root. */
type FolderIndex = { id: string; parentId: string | null };

/**
 * Bytes and file counts for each id, including every folder below it.
 * `direct` is the live total of that folder alone. A folder with nothing
 * is `{ totalBytes: 0, objectCount: 0 }`.
 */
export function rollupFolderUsage(
  index: readonly FolderIndex[],
  direct: ReadonlyMap<string, DbUsage>,
  folderIds: readonly string[],
): Map<string, DbUsage> {
  const children = new Map<string, string[]>();
  for (const folder of index) {
    if (folder.parentId == null) continue;
    const list = children.get(folder.parentId) ?? [];
    list.push(folder.id);
    children.set(folder.parentId, list);
  }
  const result = new Map<string, DbUsage>();
  for (const id of folderIds) {
    let totalBytes = 0;
    let objectCount = 0;
    const seen = new Set<string>();
    const pending = [id];
    while (pending.length > 0) {
      const current = pending.pop();
      if (current == null || seen.has(current)) continue;
      seen.add(current);
      const row = direct.get(current);
      if (row) {
        totalBytes += row.totalBytes;
        objectCount += row.objectCount;
      }
      for (const child of children.get(current) ?? []) pending.push(child);
    }
    result.set(id, { totalBytes, objectCount });
  }
  return result;
}

/** Folder ids in `folderIds` and every folder below them. */
function memberIds(
  index: readonly FolderIndex[],
  folderIds: readonly string[],
): string[] {
  const children = new Map<string, string[]>();
  for (const folder of index) {
    if (folder.parentId == null) continue;
    const list = children.get(folder.parentId) ?? [];
    list.push(folder.id);
    children.set(folder.parentId, list);
  }
  const members: string[] = [];
  const seen = new Set<string>();
  const pending = [...folderIds];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current == null || seen.has(current)) continue;
    seen.add(current);
    members.push(current);
    for (const child of children.get(current) ?? []) pending.push(child);
  }
  return members;
}

/**
 * Totals for the folders a listing is about to draw: each folder and the
 * folders below it. One read of the folder index and one read of the live
 * rows in those folders.
 */
export async function folderListingStats<TAttributes>(
  folders: Pick<StorageFolderStore, "index">,
  objects: Pick<StorageObjectStore<TAttributes>, "usageByFolder">,
  scope: string,
  folderIds: readonly string[],
): Promise<Map<string, DbUsage>> {
  if (folderIds.length === 0) return new Map();
  const index = await folders.index(scope);
  const direct = await objects.usageByFolder(
    scope,
    memberIds(index, folderIds),
  );
  return rollupFolderUsage(index, direct, folderIds);
}
