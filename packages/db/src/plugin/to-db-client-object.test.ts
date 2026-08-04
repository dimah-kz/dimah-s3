import { describe, expect, it } from "vitest";
import { toDbClientObject } from "../plugin/to-db-client-object";
import type { StorageObject } from "../types/storage-object";
import { DimahS3DbError, conflict, notFound } from "../errors";

function sampleObject(overrides: Partial<StorageObject> = {}): StorageObject {
  return {
    id: "1",
    scope: "user:1",
    bucket: "b",
    key: "k",
    contentType: "text/plain",
    size: 10,
    eTag: "abc",
    filename: "a.txt",
    status: "active",
    metadata: { x: 1 },
    acl: "private",
    uploadId: null,
    declaredSize: null,
    confirmedAt: new Date("2024-01-01T00:00:00.000Z"),
    expiresAt: null,
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    updatedAt: new Date("2024-01-01T00:00:00.000Z"),
    deletedAt: null,
    ...overrides,
  };
}

describe("toDbClientObject", () => {
  it("maps to wire shape", () => {
    const wire = toDbClientObject(sampleObject());
    expect(wire).toEqual({
      id: "1",
      bucket: "b",
      key: "k",
      filename: "a.txt",
      contentType: "text/plain",
      size: 10,
      declaredSize: null,
      status: "active",
      createdAt: "2024-01-01T00:00:00.000Z",
    });
    expect(wire).not.toHaveProperty("scope");
  });
});

describe("DimahS3DbError helpers", () => {
  it("maps codes to status", () => {
    expect(notFound().status).toBe(404);
    expect(conflict().status).toBe(409);
    expect(new DimahS3DbError("UNAUTHORIZED", "nope").code).toBe(
      "UNAUTHORIZED",
    );
  });
});
