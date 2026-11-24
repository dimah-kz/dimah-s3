import { PGlite } from "@electric-sql/pglite";
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
import {
  DimahS3Share,
  SHARE_SCHEMA_VERSION,
  type DimahS3ShareClient,
} from "@/fuma-db";
import { migrate } from "@/migrate";

/** A fresh, migrated database for one `describe`. */
type TestDatabase = {
  client: DimahS3ShareClient;
  close: () => Promise<void>;
};

/** One database of the store matrix. */
export type TestDatabaseFactory = {
  name: string;
  create: () => Promise<TestDatabase>;
};

/** A Kysely dialect over one PGlite instance. */
function pgliteDialect(pg: PGlite): Dialect {
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

async function migrated(
  db: Kysely<object>,
  provider: "sqlite" | "postgresql",
): Promise<TestDatabase> {
  const client = DimahS3Share.client(kyselyAdapter({ db, provider }));
  await migrate(client);
  return { client, close: () => db.destroy() };
}

/** SQLite (better-sqlite3) and PostgreSQL (PGlite), through Kysely. */
export const testDatabases: readonly TestDatabaseFactory[] = [
  {
    name: "kysely + better-sqlite3",
    create: () =>
      migrated(
        new Kysely({
          dialect: new SqliteDialect({ database: new Database(":memory:") }),
        }),
        "sqlite",
      ),
  },
  {
    name: "kysely + pglite",
    create: async () => {
      const pg = new PGlite();
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
 * the table before each test. Returns the client getter.
 */
export function useTestDatabase(
  factory: TestDatabaseFactory,
): () => DimahS3ShareClient {
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
    await client().orm(SHARE_SCHEMA_VERSION).deleteMany("shareLink", {});
  });
  return client;
}
