import { describe, expect, it } from "vitest";
import { rollupFolderUsage } from "./folder-listing-stats";

describe("rollupFolderUsage", () => {
  it("adds the folders below a folder and leaves an empty one at zero", () => {
    const totals = rollupFolderUsage(
      [
        { id: "docs", parentId: null },
        { id: "q4", parentId: "docs" },
        { id: "photos", parentId: null },
      ],
      new Map([
        ["docs", { totalBytes: 4, objectCount: 1 }],
        ["q4", { totalBytes: 6, objectCount: 1 }],
      ]),
      ["docs", "q4", "photos"],
    );

    expect(totals.get("docs")).toEqual({ totalBytes: 10, objectCount: 2 });
    expect(totals.get("q4")).toEqual({ totalBytes: 6, objectCount: 1 });
    expect(totals.get("photos")).toEqual({ totalBytes: 0, objectCount: 0 });
  });
});
