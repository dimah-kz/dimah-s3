import { DB_SCHEMA_VERSION, type DimahS3DbClient } from "@/fuma-db";
import { v2 } from "@/schema/v2";
import type { StorageFolder, StorageObject } from "@/types/storage-object";

/** An active `storage_object` row, as the stores return it. */
export function sampleObject<TAttributes = never>(
  overrides: Partial<StorageObject<TAttributes>> = {},
): StorageObject<TAttributes> {
  return {
    id: "1",
    scope: "user:1",
    bucket: "b",
    key: "k",
    route: "uploads",
    folder: null,
    filename: "a.txt",
    contentType: "text/plain",
    size: 10,
    declaredSize: null,
    eTag: "abc",
    status: "active",
    s3Metadata: null,
    attributes: null,
    acl: "private",
    uploadId: null,
    uploadToken: "token-1",
    expiresAt: null,
    confirmedAt: new Date("2024-01-01T00:00:00.000Z"),
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    updatedAt: new Date("2024-01-01T00:00:00.000Z"),
    deletedAt: null,
    ...overrides,
  };
}

/** A top-level `storage_folder` row. */
export function sampleFolder(
  overrides: Partial<StorageFolder> = {},
): StorageFolder {
  return {
    id: "f1",
    scope: "user:1",
    path: "docs",
    parent: null,
    name: "docs",
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

type Row = Record<string, unknown>;
type Predicate = (row: Row) => boolean;
type Where = (builder: ConditionBuilder) => Predicate | boolean;
type OrderBy = [column: string, direction: "asc" | "desc"];
type FindOptions = {
  select?: true | string[];
  where?: Where;
  orderBy?: OrderBy | OrderBy[];
  limit?: number;
  offset?: number;
};
type TableName = keyof typeof v2.tables;

type ConditionBuilder = ((
  column: string,
  operator?: string,
  value?: unknown,
) => Predicate) & {
  and: (...items: (Predicate | boolean)[]) => Predicate;
  or: (...items: (Predicate | boolean)[]) => Predicate;
  not: (item: Predicate | boolean) => Predicate;
  isNull: (column: string) => Predicate;
  isNotNull: (column: string) => Predicate;
};

function comparable(value: unknown): unknown {
  if (value instanceof Date) return value.getTime();
  return typeof value === "bigint" ? Number(value) : value;
}

function compare(a: unknown, b: unknown): number {
  const left = comparable(a) as number | string;
  const right = comparable(b) as number | string;
  return left < right ? -1 : left > right ? 1 : 0;
}

/** The string operators only apply to string columns. */
function text(value: unknown): string {
  if (typeof value !== "string") {
    throw new TypeError("memoryDbClient: string operator on a non-string");
  }
  return value;
}

function toPredicate(item: Predicate | boolean): Predicate {
  return typeof item === "boolean" ? () => item : item;
}

/** FumaDB's condition builder with SQL semantics: a null never compares. */
const conditions: ConditionBuilder = Object.assign(
  (column: string, operator?: string, value?: unknown): Predicate =>
    (row) => {
      const field = row[column];
      if (operator === undefined) return field === true;
      if (field == null || value == null) return false;
      switch (operator) {
        case "=":
          return compare(field, value) === 0;
        case "!=":
          return compare(field, value) !== 0;
        case "<":
          return compare(field, value) < 0;
        case "<=":
          return compare(field, value) <= 0;
        case ">":
          return compare(field, value) > 0;
        case ">=":
          return compare(field, value) >= 0;
        case "in":
          return (value as unknown[]).some(
            (item) => compare(field, item) === 0,
          );
        case "not in":
          return (value as unknown[]).every(
            (item) => compare(field, item) !== 0,
          );
        case "contains":
          return text(field).includes(text(value));
        case "starts with":
          return text(field).startsWith(text(value));
        case "ends with":
          return text(field).endsWith(text(value));
        default:
          throw new Error(`memoryDbClient: unsupported operator ${operator}`);
      }
    },
  {
    and:
      (...items: (Predicate | boolean)[]): Predicate =>
      (row) =>
        items.every((item) => toPredicate(item)(row)),
    or:
      (...items: (Predicate | boolean)[]): Predicate =>
      (row) =>
        items.some((item) => toPredicate(item)(row)),
    not:
      (item: Predicate | boolean): Predicate =>
      (row) =>
        !toPredicate(item)(row),
    isNull:
      (column: string): Predicate =>
      (row) =>
        row[column] == null,
    isNotNull:
      (column: string): Predicate =>
      (row) =>
        row[column] != null,
  },
);

/** Lets concurrent calls interleave between queries, as a real driver does. */
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * In-memory FumaDB client for schema 2.0.0: `version()` and `orm()` with
 * every query the stores use. It applies column defaults and the unique
 * constraints of the schema, and `transaction` does not roll back. `nulls`
 * picks where `orderBy` puts nulls: `"low"` sorts them as the smallest value
 * (SQLite, MySQL), `"high"` as the largest (PostgreSQL).
 */
export function memoryDbClient(
  options: { nulls?: "low" | "high"; version?: string } = {},
): DimahS3DbClient {
  const nullRank = options.nulls === "high" ? 1 : -1;
  const tables = Object.fromEntries(
    Object.keys(v2.tables).map((name) => [name, [] as Row[]]),
  ) as Record<TableName, Row[]>;

  const select = (table: TableName, where?: Where) => {
    const predicate = where ? toPredicate(where(conditions)) : () => true;
    return tables[table].filter(predicate);
  };

  const assertUnique = (table: TableName, row: Row) => {
    for (const constraint of v2.tables[table].getUniqueConstraints()) {
      const columns = constraint.columns.map((column) => column.ormName);
      const duplicate = tables[table].some(
        (other) =>
          other !== row &&
          columns.every(
            (column) =>
              row[column] != null && compare(other[column], row[column]) === 0,
          ),
      );
      if (duplicate) {
        throw new Error(`UNIQUE constraint failed: ${constraint.name}`);
      }
    }
  };

  const orderRows = (rows: Row[], orderBy: FindOptions["orderBy"]) => {
    if (!orderBy) return rows;
    const order = (
      Array.isArray(orderBy[0]) ? orderBy : [orderBy]
    ) as OrderBy[];
    return rows.sort((a, b) => {
      for (const [column, direction] of order) {
        const left = a[column];
        const right = b[column];
        const result =
          left == null
            ? right == null
              ? 0
              : nullRank
            : right == null
              ? -nullRank
              : compare(left, right);
        if (result !== 0) return direction === "desc" ? -result : result;
      }
      return 0;
    });
  };

  const pick = (row: Row, columns: FindOptions["select"]): Row =>
    structuredClone(
      Array.isArray(columns)
        ? Object.fromEntries(columns.map((column) => [column, row[column]]))
        : row,
    );

  const orm = {
    async transaction<T>(run: (query: object) => Promise<T>) {
      return run(orm);
    },
    async count(table: TableName, query: { where?: Where } = {}) {
      await tick();
      return select(table, query.where).length;
    },
    async findMany(table: TableName, query: FindOptions = {}) {
      await tick();
      const rows = orderRows(select(table, query.where), query.orderBy);
      const start = query.offset ?? 0;
      const end = query.limit === undefined ? undefined : start + query.limit;
      return rows.slice(start, end).map((row) => pick(row, query.select));
    },
    async findFirst(table: TableName, query: FindOptions = {}) {
      const [row] = await orm.findMany(table, { ...query, limit: 1 });
      return row ?? null;
    },
    async create(table: TableName, values: Row) {
      await tick();
      const row: Row = {};
      for (const [name, column] of Object.entries(v2.tables[table].columns)) {
        row[name] = structuredClone(
          values[name] ?? column.generateDefaultValue() ?? null,
        );
      }
      assertUnique(table, row);
      tables[table].push(row);
      return structuredClone(row);
    },
    async createMany(table: TableName, values: Row[]) {
      const created = [];
      for (const value of values) created.push(await orm.create(table, value));
      return created.map((row) => ({ _id: row.id }));
    },
    async updateMany(table: TableName, query: { where?: Where; set: Row }) {
      await tick();
      for (const row of select(table, query.where)) {
        const previous = { ...row };
        for (const [name, value] of Object.entries(query.set)) {
          if (value !== undefined) row[name] = structuredClone(value);
        }
        try {
          assertUnique(table, row);
        } catch (error) {
          Object.assign(row, previous);
          throw error;
        }
      }
    },
    async deleteMany(table: TableName, query: { where?: Where } = {}) {
      await tick();
      const removed = new Set(select(table, query.where));
      tables[table] = tables[table].filter((row) => !removed.has(row));
    },
    upsert(
      table: TableName,
      query: { where: Where; update: Row; create: Row },
    ) {
      const run = async () => {
        const existing = await orm.findFirst(table, {
          where: query.where,
          select: ["id"],
        });
        if (!existing) return orm.create(table, query.create);
        const byId: Where = (b) => b("id", "=", existing.id);
        await orm.updateMany(table, { where: byId, set: query.update });
        return orm.findFirst(table, { where: byId });
      };
      const done = () => run().then(() => undefined);
      return {
        then: (...args: Parameters<Promise<void>["then"]>) =>
          done().then(...args),
        catch: (...args: Parameters<Promise<void>["catch"]>) =>
          done().catch(...args),
        finally: (...args: Parameters<Promise<void>["finally"]>) =>
          done().finally(...args),
        forceReturning: run,
      };
    },
  };

  return {
    version: async () => options.version ?? DB_SCHEMA_VERSION,
    orm: () => orm,
  } as unknown as DimahS3DbClient;
}
