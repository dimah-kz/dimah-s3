import { PGlite, types } from "@electric-sql/pglite";
import Database from "better-sqlite3";
import { kyselyAdapter } from "fumadb/adapters/kysely";
import {
  CompiledQuery,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  SqliteDialect,
  type DatabaseConnection,
  type Dialect,
} from "kysely";
import { afterAll, beforeAll, beforeEach } from "vitest";
import { migrate } from "@/cli";
import { DB_SCHEMA_VERSION, DimahS3DB, type DimahS3DbClient } from "@/fuma-db";
import type { StorageObject } from "@/types/storage-object";
import { memoryDbClient } from "./fakes";

/** A fresh, migrated database for one test. */
export type TestDatabase = {
  client: DimahS3DbClient;
  close: () => Promise<void>;
};

/** One database of the store matrix. */
export type TestDatabaseFactory = {
  name: string;
  create: () => Promise<TestDatabase>;
};

/** A Kysely dialect over one PGlite instance. */
export function pgliteDialect(pg: PGlite): Dialect {
  const connection: DatabaseConnection = {
    async executeQuery<R>(query: CompiledQuery) {
      const result = await pg.query<R>(query.sql, [...query.parameters]);
      return {
        rows: result.rows,
        numAffectedRows:
          result.affectedRows === undefined
            ? undefined
            : BigInt(result.affectedRows),
      };
    },
    streamQuery() {
      throw new Error("PGlite dialect does not stream");
    },
  };
  const run = async (sql: string) => {
    await connection.executeQuery(CompiledQuery.raw(sql));
  };
  return {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => ({
      init: async () => {},
      acquireConnection: async () => connection,
      beginTransaction: () => run("begin"),
      commitTransaction: () => run("commit"),
      rollbackTransaction: () => run("rollback"),
      releaseConnection: async () => {},
      destroy: async () => {},
    }),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  };
}

/** Migrates a FumaDB client from an empty database with `migrate()`. */
async function migrated(
  db: Kysely<object>,
  provider: "sqlite" | "postgresql",
): Promise<TestDatabase> {
  const client = DimahS3DB.client(kyselyAdapter({ db, provider }));
  await migrate(client);
  return { client, close: () => db.destroy() };
}

/**
 * The databases every store test runs against: the in-memory fake, SQLite
 * (better-sqlite3), and PostgreSQL (PGlite). The real ones are migrated
 * through every schema version by `migrate()`, through the Kysely adapter.
 */
export const testDatabases: readonly TestDatabaseFactory[] = [
  {
    name: "memory",
    create: async () => ({ client: memoryDbClient(), close: async () => {} }),
  },
  {
    name: "better-sqlite3",
    create: () =>
      migrated(
        new Kysely({
          dialect: new SqliteDialect({ database: new Database(":memory:") }),
        }),
        "sqlite",
      ),
  },
  {
    name: "pglite",
    create: async () => {
      // PGlite sends a Date as UTC but reads `timestamp` back as local time,
      // which shifts every date by the machine's offset. Read it as UTC.
      const pg = new PGlite({
        parsers: {
          [types.TIMESTAMP]: (value) => new Date(`${value.replace(" ", "T")}Z`),
        },
      });
      const database = await migrated(
        new Kysely({ dialect: pgliteDialect(pg) }),
        "postgresql",
      );
      return {
        client: database.client,
        close: async () => {
          await database.close();
          await pg.close();
        },
      };
    },
  },
];

/**
 * Opens `factory`'s database once for the enclosing `describe` and empties
 * both tables before each test. Returns the client getter.
 */
export function useTestDatabase(
  factory: TestDatabaseFactory,
): () => DimahS3DbClient {
  let database: TestDatabase | undefined;
  const client = () => {
    if (!database) throw new Error(`${factory.name} is not open`);
    return database.client;
  };
  beforeAll(async () => {
    database = await factory.create();
  });
  afterAll(async () => {
    await database?.close();
  });
  beforeEach(async () => {
    const orm = client().orm(DB_SCHEMA_VERSION);
    await orm.deleteMany("storageObject", {});
    await orm.deleteMany("storageFolder", {});
  });
  return client;
}

/**
 * Inserts a `storage_object` row straight through the ORM: an active
 * `user:1` file at the root unless `values` say otherwise.
 */
export async function insertObject(
  client: DimahS3DbClient,
  values: Partial<StorageObject<unknown>> & { key: string },
) {
  return client.orm(DB_SCHEMA_VERSION).create("storageObject", {
    scope: "user:1",
    bucket: "b",
    route: "uploads",
    filename: values.key,
    status: "active",
    ...values,
  });
}
