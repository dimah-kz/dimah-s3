import { describe, expect, it } from "vitest";
import { readObjectListLevel } from "./read-object-list-level";

type Row = { id: string; folder: string | null };

const rows: Row[] = [
  { id: "root-file", folder: null },
  { id: "invoice", folder: "Invoices" },
  { id: "receipt", folder: "Invoices/2026" },
  { id: "hero", folder: "Images" },
  { id: "blank", folder: "" },
  { id: "dot", folder: "Images/../Invoices" },
];

describe("readObjectListLevel", () => {
  const getFolder = (row: Row) => row.folder;

  it("lists root files and the first folder segment", () => {
    const level = readObjectListLevel(rows, { parent: null, getFolder });
    expect(level.items.map((row) => row.id)).toEqual(["root-file", "blank"]);
    expect(level.folders).toEqual([
      { id: "Images", name: "Images" },
      { id: "Invoices", name: "Invoices" },
    ]);
  });

  it("lists one child folder and the files in the open folder", () => {
    const level = readObjectListLevel(rows, {
      parent: "Invoices",
      getFolder,
    });
    expect(level.items.map((row) => row.id)).toEqual(["invoice", "dot"]);
    expect(level.folders).toEqual([{ id: "Invoices/2026", name: "2026" }]);
  });

  it("returns files when the open folder has no children", () => {
    const level = readObjectListLevel(rows, {
      parent: "Invoices/2026",
      getFolder,
    });
    expect(level.items.map((row) => row.id)).toEqual(["receipt"]);
    expect(level.folders).toEqual([]);
  });
});
