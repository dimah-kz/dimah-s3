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
import { dbSchema, PREDECESSOR_VERSION, schemaIndexes } from "./schema";

const SQL_DIR = join(import.meta.dirname, "../../sql");
const DEFINITIONS = {
  storage_object: dbSchema.tables.storageObject,
  storage_folder: dbSchema.tables.storageFolder,
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
      ...schemaIndexes
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
  it("is the schema the stores read", () => {
    const client = sqliteClient(new Database(":memory:"));
    expect(client.schemas.map((schema) => schema.version)).toEqual([
      PREDECESSOR_VERSION,
      DB_SCHEMA_VERSION,
    ]);
    expect(Object.keys(client.schemas[0]?.tables ?? {})).toEqual([]);
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
});
