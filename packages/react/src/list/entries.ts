import type {
  ObjectListEntry,
  ObjectListFile,
  ObjectListFolder,
} from "./types";

/**
 * Entry key for a file or folder id. Matches `entry.key`, so a selection can
 * be built from ids you already have.
 */
export function objectListEntryKey(
  kind: ObjectListEntry<unknown>["kind"],
  id: string,
): string {
  return `${kind}:${id}`;
}

/** Folders first, then files. */
export function createObjectListEntries<TItem>(
  folders: readonly ObjectListFolder[],
  items: readonly TItem[],
  getKey: (item: TItem) => string,
  getFile: (item: TItem) => ObjectListFile,
): ObjectListEntry<TItem>[] {
  const entries: ObjectListEntry<TItem>[] = [];
  for (const folder of folders) {
    entries.push({
      kind: "folder",
      key: objectListEntryKey("folder", folder.id),
      id: folder.id,
      name: folder.name,
      folder,
    });
  }
  for (const item of items) {
    const id = getKey(item);
    const file = getFile(item);
    entries.push({
      kind: "file",
      key: objectListEntryKey("file", id),
      id,
      name: file.name,
      item,
      file,
    });
  }
  return entries;
}

/** Stored key for a file entry: `file.objectKey`, else the item key. */
export function objectKeyOf(entry: {
  id: string;
  file: Pick<ObjectListFile, "objectKey">;
}): string {
  return entry.file.objectKey || entry.id;
}
