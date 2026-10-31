import { describe, expect, it } from "vitest";
import { mapStorageObjectRow, type StorageObjectRow } from "./map-row";

function row(overrides: Partial<StorageObjectRow> = {}): StorageObjectRow {
  return {
    id: "1",
    scope: "user:1",
    bucket: "b",
    key: "k",
    route: "uploads",
    folder: "docs",
    filename: "a.txt",
    contentType: "text/plain",
    size: 10,
    declaredSize: null,
    eTag: "abc",
    status: "active",
    s3Metadata: { label: "x" },
    attributes: { starred: true },
    acl: "private",
    uploadId: null,
    uploadToken: "token",
    expiresAt: null,
    confirmedAt: new Date("2024-01-01T00:00:00.000Z"),
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    updatedAt: new Date("2024-01-01T00:00:00.000Z"),
    deletedAt: null,
    ...overrides,
  };
}

describe("mapStorageObjectRow", () => {
  it.each([
    ["a number", 5497558138880],
    ["a bigint", 5497558138880n],
    ["an int8 string", "5497558138880"],
  ])("reads a size given as %s", (_, size) => {
    const mapped = mapStorageObjectRow(row({ size, declaredSize: size }));
    expect(mapped.size).toBe(5497558138880);
    expect(mapped.declaredSize).toBe(5497558138880);
  });

  it("keeps the JSON columns and normalizes missing ones to null", () => {
    expect(mapStorageObjectRow<{ starred: boolean }>(row())).toMatchObject({
      folder: "docs",
      s3Metadata: { label: "x" },
      attributes: { starred: true },
    });
    const empty = mapStorageObjectRow(
      row({ s3Metadata: undefined, attributes: undefined, size: null }),
    );
    expect(empty).toMatchObject({
      s3Metadata: null,
      attributes: null,
      size: null,
    });
  });
});
