import { vi } from "vitest";
import type { StorageObjectStore } from "@/store/storage-object-store";
import type { StorageObject } from "@/types/storage-object";

export function sampleObject(
  overrides: Partial<StorageObject> = {},
): StorageObject {
  return {
    id: "1",
    scope: "user:1",
    bucket: "b",
    key: "k",
    route: "uploads",
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

export function fakeStore(
  overrides: Partial<StorageObjectStore> = {},
): StorageObjectStore {
  return {
    upsertPending: vi.fn(async () => {}),
    markActive: vi.fn(async () => {}),
    find: vi.fn(async () => null),
    findByScopeKey: vi.fn(async () => null),
    findActive: vi.fn(async () => null),
    findPendingMultipart: vi.fn(async () => null),
    listByScope: vi.fn(async () => []),
    getScopeUsage: vi.fn(async () => ({ totalBytes: 0, objectCount: 0 })),
    countByScope: vi.fn(async () => 0),
    softDelete: vi.fn(async () => {}),
    hardDelete: vi.fn(async () => {}),
    deletePending: vi.fn(async () => {}),
    findStalePending: vi.fn(async () => []),
    deleteByIds: vi.fn(async () => {}),
    ...overrides,
  };
}
