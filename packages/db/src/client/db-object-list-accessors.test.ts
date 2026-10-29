import { describe, expect, it } from "vitest";
import type { DbClientObject } from "@/types/storage-object";
import { dbObjectListAccessors } from "./db-object-list-accessors";

function row(patch: Partial<DbClientObject> = {}): DbClientObject {
  return {
    id: "row-1",
    bucket: "b",
    key: "docs/uuid/notes.md",
    route: "docs",
    filename: "Notes.md",
    contentType: "text/markdown",
    size: 4096,
    declaredSize: null,
    status: "active",
    createdAt: "2024-01-01T00:00:00.000Z",
    ...patch,
  };
}

describe("dbObjectListAccessors", () => {
  const files = dbObjectListAccessors();

  it("uses the row id, object key, filename, type, and verified size", () => {
    const object = row();
    expect(files.getKey(object)).toBe("row-1");
    expect(files.getObjectKey(object)).toBe("docs/uuid/notes.md");
    expect(files.getLabel(object)).toBe("Notes.md");
    expect(files.getFileName(object)).toBe("Notes.md");
    expect(files.getFileType(object)).toBe("text/markdown");
    expect(files.getDescription(object)).toBe("4.0 KB");
  });

  it("falls back to the key leaf when the filename is missing", () => {
    const object = row({ filename: null, size: null, contentType: null });
    expect(files.getLabel(object)).toBe("notes.md");
    expect(files.getFileName(object)).toBe("notes.md");
    expect(files.getFileType(object)).toBeNull();
    expect(files.getDescription(object)).toBeNull();
  });
});
