import { vi } from "vitest";
import type { StorageObjectRow } from "@/store/map-row";
import type {
  DimahS3DbClient,
  StorageObjectStore,
} from "@/store/storage-object-store";
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
    upsertPending: vi.fn(async () => sampleObject({ status: "pending" })),
    markActive: vi.fn(async () => sampleObject({ status: "active" })),
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

type Column = keyof StorageObjectRow;
type Predicate = (row: StorageObjectRow) => boolean;
type Comparable = Date | bigint | number | string;

function compare(a: Comparable, b: Comparable): number {
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * In-memory `storage_object` table behind `findMany` and `count`. Like SQL,
 * a null never satisfies a comparison. `nulls` picks where `orderBy` puts
 * them: `"low"` sorts them as the smallest value (SQLite, MySQL), `"high"`
 * as the largest (PostgreSQL).
 */
export function memoryDbClient(
  rows: StorageObjectRow[],
  options: { nulls?: "low" | "high" } = {},
): DimahS3DbClient {
  const nullRank = options.nulls === "high" ? 1 : -1;
  const builder = Object.assign(
    (column: Column, operator: string, value: Comparable): Predicate =>
      (row) => {
        const field = row[column] as Comparable | null;
        if (field == null || value == null) return false;
        switch (operator) {
          case "=":
            return compare(field, value) === 0;
          case "!=":
            return compare(field, value) !== 0;
          case "<":
            return compare(field, value) < 0;
          case ">":
            return compare(field, value) > 0;
          case "contains":
            return String(field).includes(String(value));
          case "starts with":
            return String(field).startsWith(String(value));
          default:
            throw new Error(`memoryDbClient: unsupported operator ${operator}`);
        }
      },
    {
      and:
        (...parts: Predicate[]): Predicate =>
        (row) =>
          parts.every((part) => part(row)),
      or:
        (...parts: Predicate[]): Predicate =>
        (row) =>
          parts.some((part) => part(row)),
      isNull:
        (column: Column): Predicate =>
        (row) =>
          row[column] == null,
      isNotNull:
        (column: Column): Predicate =>
        (row) =>
          row[column] != null,
    },
  );

  const select = (where?: (b: typeof builder) => Predicate) =>
    rows.filter(where ? where(builder) : () => true);

  const orm = {
    async findMany(
      _table: string,
      query: {
        where?: (b: typeof builder) => Predicate;
        orderBy?: [Column, "asc" | "desc"][];
        limit?: number;
        offset?: number;
      } = {},
    ) {
      const found = select(query.where).sort((a, b) => {
        for (const [column, direction] of query.orderBy ?? []) {
          const left = a[column] as Comparable | null;
          const right = b[column] as Comparable | null;
          const order =
            left === null
              ? right === null
                ? 0
                : nullRank
              : right === null
                ? -nullRank
                : compare(left, right);
          if (order !== 0) return direction === "desc" ? -order : order;
        }
        return 0;
      });
      const start = query.offset ?? 0;
      return found.slice(
        start,
        query.limit === undefined ? undefined : start + query.limit,
      );
    },
    async count(
      _table: string,
      query: { where?: (b: typeof builder) => Predicate } = {},
    ) {
      return select(query.where).length;
    },
  };
  return { orm: () => orm } as unknown as DimahS3DbClient;
}
