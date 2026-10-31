import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import Database from "better-sqlite3";
import { kyselyAdapter } from "fumadb/adapters/kysely";
import { Kysely, SqliteDialect } from "kysely";
import { afterEach, describe, expect, it } from "vitest";
import { migrate } from "./cli";
import { DB_SCHEMA_VERSION, DimahS3DB, type DimahS3DbClient } from "./fuma-db";
import { v2Indexes } from "./schema/v2";
import { createDbStore } from "./store/create-db-store";
import { checkSchemaVersion } from "./store/schema-version";
import { pgliteDialect } from "./test/databases";

const UPGRADE_SQL = join(
  import.meta.dirname,
  "../sql/upgrade/1.0.0-2.0.0/sqlite.sql",
);
const INDEX_NAMES = v2Indexes.map((index) => index.name).sort();

/** Migrates to 1.0.0 and writes 1.x rows, with sizes as FumaDB bigints. */
async function seedV1(client: DimahS3DbClient) {
  await (await client.createMigrator().migrateTo("1.0.0")).execute();
  const base = {
    scope: "user:1",
    bucket: "b",
    route: "files",
    status: "active",
  };
  const orm = client.orm("1.0.0");
  await orm.create("storageObject", {
    ...base,
    id: "named",
    key: "users/1/a.txt",
    filename: "Report.txt",
    size: 5497558138880n,
  });
  await orm.create("storageObject", {
    ...base,
    id: "unnamed",
    key: "users/1/report.pdf",
    size: 42n,
  });
  await orm.create("storageObject", {
    ...base,
    id: "pending",
    key: "users/1/draft/",
    status: "pending",
    declaredSize: 7n,
  });
}

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

    it("upgrades a 1.0.0 database", async () => {
      const { client, indexes } = connect();
      await seedV1(client);

      await migrate(client);

      await expect(client.version()).resolves.toBe(DB_SCHEMA_VERSION);
      expect(await indexes()).toEqual(INDEX_NAMES);
      const rows = await client
        .orm(DB_SCHEMA_VERSION)
        .findMany("storageObject", { orderBy: [["id", "asc"]] });
      expect(
        rows.map((row) => ({
          id: row.id,
          filename: row.filename,
          folder: row.folder,
          size: row.size === null ? null : Number(row.size),
          declaredSize:
            row.declaredSize === null ? null : Number(row.declaredSize),
        })),
      ).toEqual([
        {
          id: "named",
          filename: "Report.txt",
          folder: null,
          size: 5497558138880,
          declaredSize: null,
        },
        {
          id: "pending",
          filename: "users/1/draft/",
          folder: null,
          size: null,
          declaredSize: 7,
        },
        {
          id: "unnamed",
          filename: "report.pdf",
          folder: null,
          size: 42,
          declaredSize: null,
        },
      ]);
    });

    it("does nothing on a database that is already current", async () => {
      const { client } = connect();
      await migrate(client);

      await migrate(client);

      await expect(client.version()).resolves.toBe(DB_SCHEMA_VERSION);
    });
  });

  it("stores upgraded SQLite sizes as numbers, which sort with new rows", async () => {
    const { database, client } = sqlite();
    await seedV1(client);

    await migrate(client);
    const objects = createDbStore(client).objects;
    await client.orm(DB_SCHEMA_VERSION).create("storageObject", {
      scope: "user:1",
      bucket: "b",
      key: "users/1/new.txt",
      route: "files",
      filename: "new.txt",
      status: "active",
      size: 1000,
    });

    // FumaDB declares the column BLOB, and better-sqlite3 binds a number as
    // REAL, which SQLite compares with INTEGER by value.
    expect(
      database
        .prepare(
          `SELECT count(*) AS "blobs" FROM "storage_object" WHERE typeof("size") = 'blob' OR typeof("declared_size") = 'blob'`,
        )
        .get(),
    ).toEqual({ blobs: 0 });
    const page = await objects.list({
      scope: "user:1",
      sort: { field: "size", direction: "asc" },
    });
    expect(page.objects.map((object) => object.size)).toEqual([
      42, 1000, 5497558138880,
    ]);
  });

  it("upgrades SQLite the same way as the upgrade SQL file", async () => {
    const select = `SELECT "id", "filename", "folder", "size", "declared_size", "status", "s3_metadata", "attributes" FROM "storage_object" ORDER BY "id"`;
    const viaMigrate = sqlite();
    await seedV1(viaMigrate.client);
    await migrate(viaMigrate.client);
    const viaFile = sqlite();
    await seedV1(viaFile.client);
    viaFile.database.exec(readFileSync(UPGRADE_SQL, "utf8"));

    expect(viaMigrate.database.prepare(select).all()).toEqual(
      viaFile.database.prepare(select).all(),
    );
    expect(viaMigrate.indexes()).toEqual(viaFile.indexes());
  });
});
