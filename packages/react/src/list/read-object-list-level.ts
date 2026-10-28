import type { ObjectListFolder } from "./types";

export type ObjectListLevel<TItem> = {
  folders: ObjectListFolder[];
  items: TItem[];
};

/**
 * Split a flat catalog into the folders and files at one level.
 *
 * `getFolder` returns a `/`-separated path. `null` means the record sits
 * at the root. Pagination is the caller's job: pass the full set that
 * belongs in this listing, not one unrelated page.
 */
export function readObjectListLevel<TItem>(
  records: readonly TItem[],
  input: {
    parent: string | null;
    getFolder: (record: TItem) => string | null | undefined;
  },
): ObjectListLevel<TItem> {
  const parent = normalizeFolder(input.parent);
  const folders = new Map<string, ObjectListFolder>();
  const items: TItem[] = [];

  for (const record of records) {
    const folder = normalizeFolder(input.getFolder(record));
    if (parent == null) {
      if (folder == null) {
        items.push(record);
        continue;
      }
      const name = folder.split("/")[0];
      if (!name) continue;
      folders.set(name, { id: name, name });
      continue;
    }

    if (folder == null) continue;
    if (folder === parent) {
      items.push(record);
      continue;
    }
    const prefix = `${parent}/`;
    if (!folder.startsWith(prefix)) continue;
    const name = folder.slice(prefix.length).split("/")[0];
    if (!name) continue;
    const id = `${parent}/${name}`;
    folders.set(id, { id, name });
  }

  return {
    folders: [...folders.values()].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, {
        numeric: true,
        sensitivity: "base",
      }),
    ),
    items,
  };
}

/** Collapse `.` / `..` and empty segments. `null` means the root. */
function normalizeFolder(folder: string | null | undefined): string | null {
  if (folder == null) return null;
  const parts: string[] = [];
  for (const raw of folder.split("/")) {
    const part = raw.trim();
    if (!part || part === ".") continue;
    if (part === "..") {
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return parts.length > 0 ? parts.join("/") : null;
}
