import { readFileSync } from "node:fs";
import { join } from "node:path";
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
import { describe, expect, it } from "vitest";
import { migrate } from "@/cli";
import { DB_SCHEMA_VERSION, DimahS3DB } from "@/fuma-db";
import { v2, v2Indexes } from "./v2";

const SQL_DIR = join(import.meta.dirname, "../../sql");
const DEFINITIONS = {
  storage_object: v2.tables.storageObject,
  storage_folder: v2.tables.storageFolder,
};
const TABLES = ["storage_object", "storage_folder"] as const;

function readSql(path: string): string {
  return readFileSync(join(SQL_DIR, path), "utf8");
}

type Shape = {
  columns: { name: string; nullable: boolean; type?: string }[];
  indexes: { name: string; unique: boolean; columns: string[] }[];
};

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name);

function columnList(entries: [name: string, nullable: boolean][]) {
  return entries.map(([name, nullable]) => ({ name, nullable })).sort(byName);
}

function withoutTypes(shape: Shape): Shape {
  return {
    ...shape,
    columns: shape.columns.map(({ name, nullable }) => ({ name, nullable })),
  };
}

/** Columns and indexes schema 2.0.0 declares for a SQL table. */
function expectedShape(table: (typeof TABLES)[number]): Shape {
  const definition = DEFINITIONS[table];
  return {
    columns: Object.values(definition.columns)
      .map((column) => ({
        name: column.names.sql,
        nullable: column.isNullable,
      }))
      .sort(byName),
    indexes: [
      ...definition.getUniqueConstraints().map((constraint) => ({
        name: constraint.name,
        unique: true,
        columns: constraint.columns.map((column) => column.names.sql),
      })),
      ...v2Indexes
        .filter((index) => index.table === table)
        .map((index) => ({
          name: index.name,
          unique: false,
          columns: [...index.columns],
        })),
    ].sort(byName),
  };
}

function sqliteShape(db: Database.Database, table: string): Shape {
  const columns = db
    .prepare<
      [string],
      { name: string; type: string; notnull: number; pk: number }
    >(`SELECT "name", "type", "notnull", "pk" FROM pragma_table_info(?)`)
    .all(table)
    .map((column) => ({
      name: column.name,
      nullable: column.notnull === 0 && column.pk === 0,
      type: column.type.toLowerCase(),
    }));
  const indexes = db
    .prepare<[string], { name: string; unique: number }>(
      `SELECT "name", "unique" FROM pragma_index_list(?) WHERE "origin" != 'pk'`,
    )
    .all(table)
    .map((index) => ({
      name: index.name,
      unique: index.unique === 1,
      columns: db
        .prepare<[string], { name: string }>(
          `SELECT "name" FROM pragma_index_info(?) ORDER BY "seqno"`,
        )
        .all(index.name)
        .map((column) => column.name),
    }));
  return { columns: columns.sort(byName), indexes: indexes.sort(byName) };
}

async function pgShape(pg: PGlite, table: string): Promise<Shape> {
  const columns = await pg.query<{
    name: string;
    nullable: string;
    type: string;
  }>(
    `SELECT "column_name" AS "name", "is_nullable" AS "nullable", "data_type" AS "type"
     FROM "information_schema"."columns" WHERE "table_name" = $1`,
    [table],
  );
  const indexes = await pg.query<{
    name: string;
    unique: boolean;
    columns: string[];
  }>(
    `SELECT "i"."relname" AS "name", "x"."indisunique" AS "unique",
       array_agg("a"."attname" ORDER BY "k"."ord")::text[] AS "columns"
     FROM "pg_index" "x"
     JOIN "pg_class" "t" ON "t"."oid" = "x"."indrelid"
     JOIN "pg_class" "i" ON "i"."oid" = "x"."indexrelid"
     CROSS JOIN LATERAL unnest("x"."indkey") WITH ORDINALITY AS "k" ("attnum", "ord")
     JOIN "pg_attribute" "a" ON "a"."attrelid" = "t"."oid" AND "a"."attnum" = "k"."attnum"
     WHERE "t"."relname" = $1 AND NOT "x"."indisprimary"
     GROUP BY "i"."relname", "x"."indisunique"`,
    [table],
  );
  return {
    columns: columns.rows
      .map((column) => ({
        name: column.name,
        nullable: column.nullable === "YES",
        type: column.type,
      }))
      .sort(byName),
    indexes: indexes.rows.sort(byName),
  };
}

/** Reads `CREATE TABLE` blocks of the MySQL file. Prefix lengths are dropped. */
function mysqlShape(sql: string, table: string): Shape {
  const body = new RegExp(
    `CREATE TABLE \`${table}\` \\(\\n([\\s\\S]*?)\\n\\)`,
  ).exec(sql)?.[1];
  if (!body) throw new Error(`No CREATE TABLE for ${table}`);
  const shape: Shape = { columns: [], indexes: [] };
  for (const line of body.split("\n").map((item) => item.trim())) {
    const column = /^`(\w+)` /.exec(line);
    const index = /^(UNIQUE )?KEY `(\w+)` \((.+)\),?$/.exec(line);
    if (column) {
      const nullable = !line.includes("NOT NULL") && column[1] !== "id";
      shape.columns.push({ name: column[1], nullable });
    } else if (index) {
      shape.indexes.push({
        name: index[2],
        unique: index[1] !== undefined,
        columns: index[3]
          .split(", ")
          .map((item) => item.replaceAll("`", "").replace(/\(\d+\)$/, "")),
      });
    }
  }
  shape.columns.sort(byName);
  shape.indexes.sort(byName);
  return shape;
}

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

function sqliteClient(database: Database.Database) {
  const db = new Kysely<object>({ dialect: new SqliteDialect({ database }) });
  return DimahS3DB.client(kyselyAdapter({ db, provider: "sqlite" }));
}

function pgClient(pg: PGlite) {
  const db = new Kysely<object>({ dialect: pgliteDialect(pg) });
  return DimahS3DB.client(kyselyAdapter({ db, provider: "postgresql" }));
}

type Client = ReturnType<typeof sqliteClient>;

/** Migrates to 1.0.0 and inserts one row with a filename and one without. */
async function seedV1(client: Client) {
  const migrator = client.createMigrator();
  await (await migrator.migrateTo("1.0.0")).execute();
  const orm = client.orm("1.0.0");
  const base = {
    scope: "user:1",
    bucket: "b",
    route: "files",
    status: "active",
    s3Metadata: { label: "kept" },
  };
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
    key: "users/1/photo.png",
    size: 42n,
  });
}

const sampleObject = {
  scope: "user:1",
  bucket: "b",
  key: "users/1/a.txt",
  route: "files",
  folder: "docs/q4",
  filename: "a.txt",
  status: "active",
  size: 5497558138880,
  s3Metadata: { "x-amz-meta-a": "1" },
  attributes: { starred: true },
  uploadToken: "token",
};

describe("schema 2.0.0", () => {
  it("is the latest of the library's schemas", () => {
    const client = sqliteClient(new Database(":memory:"));
    expect(client.schemas.map((schema) => schema.version)).toEqual([
      "1.0.0",
      "2.0.0",
    ]);
    expect(DB_SCHEMA_VERSION).toBe("2.0.0");
  });

  it("declares the spec columns", () => {
    expect(expectedShape("storage_object").columns).toEqual(
      columnList([
        ["id", false],
        ["scope", false],
        ["bucket", false],
        ["key", false],
        ["route", false],
        ["folder", true],
        ["filename", false],
        ["content_type", true],
        ["size", true],
        ["declared_size", true],
        ["e_tag", true],
        ["status", false],
        ["s3_metadata", true],
        ["attributes", true],
        ["acl", true],
        ["upload_id", true],
        ["upload_token", true],
        ["expires_at", true],
        ["confirmed_at", true],
        ["created_at", false],
        ["updated_at", false],
        ["deleted_at", true],
      ]),
    );
    expect(expectedShape("storage_folder").columns).toEqual(
      columnList([
        ["id", false],
        ["scope", false],
        ["path", false],
        ["parent", true],
        ["name", false],
        ["created_at", false],
      ]),
    );
  });
});

describe("sql/sqlite.sql", () => {
  function create() {
    const database = new Database(":memory:");
    database.exec(readSql("sqlite.sql"));
    return database;
  }

  it.each(TABLES)("creates %s as declared", (table) => {
    expect(withoutTypes(sqliteShape(create(), table))).toEqual(
      expectedShape(table),
    );
  });

  it("stores sizes as INTEGER through the Kysely adapter", async () => {
    const database = create();
    const client = sqliteClient(database);
    expect(await client.version()).toBe("2.0.0");

    const created = await client
      .orm("2.0.0")
      .create("storageObject", sampleObject);
    expect(created).toMatchObject({
      ...sampleObject,
      size: 5497558138880,
      declaredSize: null,
    });
    expect(created.createdAt).toBeInstanceOf(Date);
    expect(
      database
        .prepare(`SELECT typeof("size") AS "type" FROM "storage_object"`)
        .get(),
    ).toEqual({ type: "integer" });
  });
});

describe("sql/pg.sql", () => {
  async function create() {
    const pg = new PGlite();
    await pg.exec(readSql("pg.sql"));
    return pg;
  }

  it.each(TABLES)("creates %s as declared", async (table) => {
    expect(withoutTypes(await pgShape(await create(), table))).toEqual(
      expectedShape(table),
    );
  });

  it.each(TABLES)(
    "matches the columns and indexes migrate() creates for %s",
    async (table) => {
      const fuma = new PGlite();
      await migrate(pgClient(fuma));
      expect(await pgShape(await create(), table)).toEqual(
        await pgShape(fuma, table),
      );
    },
  );

  it("round-trips a row through the Kysely adapter", async () => {
    const client = pgClient(await create());
    expect(await client.version()).toBe("2.0.0");
    const orm = client.orm("2.0.0");
    const created = await orm.create("storageObject", sampleObject);
    const found = await orm.findFirst("storageObject", {
      where: (b) => b("id", "=", created.id),
    });
    expect(found).toMatchObject({ ...sampleObject, size: 5497558138880 });
  });
});

describe("sql/mysql.sql", () => {
  it.each(TABLES)("creates %s as declared", (table) => {
    expect(mysqlShape(readSql("mysql.sql"), table)).toEqual(
      expectedShape(table),
    );
  });

  it("indexes long columns by prefix", () => {
    const sql = readSql("mysql.sql");
    expect(sql).toContain("(`bucket`, `key`(512))");
    expect(sql).toContain("`folder`(255)");
    expect(sql).toContain("(`scope`, `path`(512))");
  });

  it("adds the same indexes on upgrade", () => {
    const upgrade = readSql("upgrade/1.0.0-2.0.0/mysql.sql");
    for (const { name } of expectedShape("storage_object").indexes) {
      expect(upgrade).toMatch(new RegExp(`ADD (UNIQUE )?KEY \`${name}\``));
    }
    expect(mysqlShape(upgrade, "storage_folder")).toEqual(
      expectedShape("storage_folder"),
    );
  });
});

describe("sql/upgrade/1.0.0-2.0.0", () => {
  it("upgrades a 1.x SQLite database", async () => {
    const database = new Database(":memory:");
    await seedV1(sqliteClient(database));
    // A 1.x Drizzle row: decimal blob size, JSON blob metadata, seconds.
    database
      .prepare(
        `INSERT INTO "storage_object" ("id", "scope", "bucket", "key", "route", "status", "size", "metadata", "created_at", "updated_at")
         VALUES ('drizzle', 'user:1', 'b', 'users/1/notes/', 'files', 'pending', ?, ?, 1700000000, 1700000000)`,
      )
      .run(Buffer.from("123456789"), Buffer.from('{"a":"b"}'));

    database.exec(readSql("upgrade/1.0.0-2.0.0/sqlite.sql"));

    const fresh = new Database(":memory:");
    fresh.exec(readSql("sqlite.sql"));
    for (const table of TABLES) {
      expect(sqliteShape(database, table)).toEqual(sqliteShape(fresh, table));
    }

    const rows = database
      .prepare(
        `SELECT "id", "filename", "folder", typeof("size") AS "sizeType", "size", "s3_metadata", "created_at"
         FROM "storage_object" ORDER BY "id"`,
      )
      .all();
    expect(rows).toEqual([
      {
        id: "drizzle",
        filename: "users/1/notes/",
        folder: null,
        sizeType: "integer",
        size: 123456789,
        s3_metadata: '{"a":"b"}',
        created_at: 1700000000000,
      },
      expect.objectContaining({
        id: "named",
        filename: "Report.txt",
        sizeType: "integer",
        size: 5497558138880,
        s3_metadata: '{"label":"kept"}',
      }),
      expect.objectContaining({
        id: "unnamed",
        filename: "photo.png",
        sizeType: "integer",
        size: 42,
      }),
    ]);

    const client = sqliteClient(database);
    expect(await client.version()).toBe("2.0.0");
    const named = await client.orm("2.0.0").findFirst("storageObject", {
      where: (b) => b("id", "=", "named"),
    });
    expect(named?.createdAt.getTime()).toBeGreaterThan(1700000000000);
  });

  it("upgrades a 1.x PostgreSQL database", async () => {
    const pg = new PGlite();
    await seedV1(pgClient(pg));

    await pg.exec(readSql("upgrade/1.0.0-2.0.0/pg.sql"));

    const fresh = new PGlite();
    await fresh.exec(readSql("pg.sql"));
    for (const table of TABLES) {
      expect(await pgShape(pg, table)).toEqual(await pgShape(fresh, table));
    }

    const client = pgClient(pg);
    expect(await client.version()).toBe("2.0.0");
    const rows = await client.orm("2.0.0").findMany("storageObject", {
      orderBy: [["id", "asc"]],
    });
    expect(rows).toMatchObject([
      { id: "named", filename: "Report.txt", s3Metadata: { label: "kept" } },
      { id: "unnamed", filename: "photo.png", folder: null, attributes: null },
    ]);
  });
});

describe("FumaDB migration 1.0.0 → 2.0.0", () => {
  it.each([
    ["SQLite", () => sqliteClient(new Database(":memory:"))],
    ["PostgreSQL", () => pgClient(new PGlite())],
  ])("keeps the 1.x data on %s", async (_, connect) => {
    const client = connect();
    await seedV1(client);

    await (await client.createMigrator().up()).execute();

    expect(await client.version()).toBe("2.0.0");
    const orm = client.orm("2.0.0");
    const rows = await orm.findMany("storageObject", {
      orderBy: [["id", "asc"]],
    });
    expect(rows).toMatchObject([
      { id: "named", filename: "Report.txt", s3Metadata: { label: "kept" } },
      {
        id: "unnamed",
        filename: "photo.png",
        folder: null,
        s3Metadata: { label: "kept" },
      },
    ]);
    expect(rows.map((row) => Number(row.size))).toEqual([5497558138880, 42]);

    const folder = await orm.create("storageFolder", {
      scope: "user:1",
      path: "docs",
      name: "docs",
    });
    expect(folder).toMatchObject({ path: "docs", parent: null });
  });

  it("creates the 2.0.0 indexes", async () => {
    const database = new Database(":memory:");
    const client = sqliteClient(database);
    await seedV1(client);
    await (await client.createMigrator().up()).execute();

    for (const table of TABLES) {
      expect(sqliteShape(database, table).indexes).toEqual(
        expectedShape(table).indexes,
      );
    }
  });
});
