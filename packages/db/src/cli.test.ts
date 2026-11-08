import { PGlite } from "@electric-sql/pglite";
import Database from "better-sqlite3";
import { kyselyAdapter } from "fumadb/adapters/kysely";
import { Kysely, SqliteDialect } from "kysely";
import { afterEach, describe, expect, it } from "vitest";
import { migrate } from "./cli";
import { DB_SCHEMA_VERSION, DimahS3DB } from "./fuma-db";
import { dbSchema } from "./schema/schema";
import { createDbStore } from "./store/create-db-store";
import { checkSchemaVersion } from "./store/schema-version";
import { pgliteDialect } from "./test/databases";
import { memoryDbClient } from "./test/fakes";

const INDEX_NAMES = Object.values(dbSchema.tables)
  .flatMap((table) => table.getIndexes().map((index) => index.name))
  .sort();

describe("migrate", () => {
  const cleanups: (() => Promise<void>)[] = [];

  afterEach(async () => {
    for (const cleanup of cleanups.splice(0)) await cleanup();
  });

  function sqlite() {
    const database = new Database(":memory:");
    const kysely = new Kysely<object>({
      dialect: new SqliteDialect({ database }),
    });
    cleanups.push(() => kysely.destroy());
    const client = DimahS3DB.client(
      kyselyAdapter({ db: kysely, provider: "sqlite" }),
    );
    const indexes = () =>
      database
        .prepare<[], { name: string }>(
          `SELECT "name" FROM "sqlite_master" WHERE "type" = 'index' AND "name" NOT LIKE 'sqlite_%' AND "name" NOT LIKE '%_uk'`,
        )
        .all()
        .map((row) => row.name)
        .sort();
    return { database, client, indexes };
  }

  function postgres() {
    const pg = new PGlite();
    const kysely = new Kysely<object>({ dialect: pgliteDialect(pg) });
    cleanups.push(async () => {
      await kysely.destroy();
      await pg.close();
    });
    const client = DimahS3DB.client(
      kyselyAdapter({ db: kysely, provider: "postgresql" }),
    );
    const indexes = async () =>
      (
        await pg.query<{ name: string }>(
          `SELECT "indexname" AS "name" FROM "pg_indexes" WHERE "tablename" IN ('storage_object', 'storage_folder') AND "indexname" NOT LIKE '%_uk' AND "indexname" NOT LIKE '%_pkey'`,
        )
      ).rows
        .map((row) => row.name)
        .sort();
    return { client, indexes };
  }

  describe.each([
    ["SQLite", sqlite],
    ["PostgreSQL", postgres],
  ])("on %s", (_, connect) => {
    it("creates the schema and its indexes in an empty database", async () => {
      const { client, indexes } = connect();

      await migrate(client);

      await expect(client.version()).resolves.toBe(DB_SCHEMA_VERSION);
      await expect(checkSchemaVersion(client)).resolves.toBeUndefined();
      expect(await indexes()).toEqual(INDEX_NAMES);
    });

    it("creates the same indexes as the FumaDB CLI's migrate", async () => {
      const { client, indexes } = connect();

      await (await client.createMigrator().migrateToLatest()).execute();

      await expect(client.version()).resolves.toBe(DB_SCHEMA_VERSION);
      expect(await indexes()).toEqual(INDEX_NAMES);
    });

    it("does nothing on a database that is already current", async () => {
      const { client } = connect();
      await migrate(client);

      await migrate(client);

      await expect(client.version()).resolves.toBe(DB_SCHEMA_VERSION);
    });
  });

  it("refuses a database at another schema version", async () => {
    const client = memoryDbClient({ version: "1.0.0" });

    await expect(migrate(client)).rejects.toThrow(
      /schema 1\.0\.0.*does not upgrade/,
    );
  });

  it("stores SQLite sizes as integers, which sort by value", async () => {
    const { database, client } = sqlite();
    await migrate(client);
    const objects = createDbStore(client).objects;
    const row = {
      scope: "user:1",
      bucket: "b",
      route: "files",
      status: "active",
    };
    await client.orm(DB_SCHEMA_VERSION).create("storageObject", {
      ...row,
      key: "users/1/new.txt",
      filename: "new.txt",
      size: 5497558138880n,
    });
    await client.orm(DB_SCHEMA_VERSION).create("storageObject", {
      ...row,
      key: "users/1/a.txt",
      filename: "a.txt",
      size: 42n,
    });

    expect(
      database
        .prepare(
          `SELECT DISTINCT typeof("size") AS "type" FROM "storage_object"`,
        )
        .all(),
    ).toEqual([{ type: "integer" }]);
    const page = await objects.list({
      scope: "user:1",
      sort: { field: "size", direction: "asc" },
    });
    expect(page.objects.map((object) => object.size)).toEqual([
      42, 5497558138880,
    ]);
  });
});
