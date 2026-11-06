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

/** Entries built for one set of folders and items. @internal */
export type ObjectListEntryCache<TItem> = {
  folders: readonly ObjectListFolder[];
  items: readonly TItem[];
  entries: readonly ObjectListEntry<TItem>[];
};

/**
 * Like {@link createObjectListEntries}, but a folder or item that is the
 * same object as in `previous` keeps its entry, and the same entries keep
 * the same array. `getKey` and `getFile` are pure, so they run only for
 * new items. @internal
 */
export function reuseObjectListEntries<TItem>(
  previous: ObjectListEntryCache<TItem> | null,
  folders: readonly ObjectListFolder[],
  items: readonly TItem[],
  getKey: (item: TItem) => string,
  getFile: (item: TItem) => ObjectListFile,
): ObjectListEntryCache<TItem> {
  if (!previous) {
    return {
      folders,
      items,
      entries: createObjectListEntries(folders, items, getKey, getFile),
    };
  }
  const folderEntries = new Map<ObjectListFolder, ObjectListEntry<TItem>>();
  const fileEntries = new Map<TItem, ObjectListEntry<TItem>>();
  for (const entry of previous.entries) {
    if (entry.kind === "folder") folderEntries.set(entry.folder, entry);
    else fileEntries.set(entry.item, entry);
  }
  const entries: ObjectListEntry<TItem>[] = [];
  for (const folder of folders) {
    entries.push(
      folderEntries.get(folder) ?? {
        kind: "folder",
        key: objectListEntryKey("folder", folder.id),
        id: folder.id,
        name: folder.name,
        folder,
      },
    );
  }
  for (const item of items) {
    const kept = fileEntries.get(item);
    if (kept) {
      entries.push(kept);
      continue;
    }
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
  const same =
    entries.length === previous.entries.length &&
    entries.every((entry, index) => entry === previous.entries[index]);
  return { folders, items, entries: same ? previous.entries : entries };
}

/** Stored key for a file entry: `file.objectKey`, else the item key. */
export function objectKeyOf(entry: {
  id: string;
  file: Pick<ObjectListFile, "objectKey">;
}): string {
  return entry.file.objectKey || entry.id;
}
