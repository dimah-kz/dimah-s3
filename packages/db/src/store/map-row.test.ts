import { describe, expect, it } from "vitest";
import { mapStorageObjectRow, type StorageObjectRow } from "./map-row";

function row(overrides: Partial<StorageObjectRow> = {}): StorageObjectRow {
  return {
    id: "1",
    scope: "user:1",
    bucket: "b",
    key: "k",
    route: "uploads",
    contentType: "text/plain",
    size: 10n,
    eTag: "abc",
    filename: "a.txt",
    status: "active",
    metadata: { x: 1 },
    acl: "private",
    uploadId: null,
    declaredSize: 20n,
    confirmedAt: new Date("2024-01-01T00:00:00.000Z"),
    expiresAt: null,
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    updatedAt: new Date("2024-01-01T00:00:00.000Z"),
    deletedAt: null,
    ...overrides,
  };
}

describe("mapStorageObjectRow", () => {
  it("converts bigint sizes to numbers", () => {
    const mapped = mapStorageObjectRow(row());
    expect(mapped.size).toBe(10);
    expect(mapped.declaredSize).toBe(20);
    expect(mapped.status).toBe("active");
  });

  it("normalizes null metadata", () => {
    expect(
      mapStorageObjectRow(row({ metadata: null, size: null })).metadata,
    ).toBeNull();
  });
});
