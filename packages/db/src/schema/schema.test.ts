import { PGlite } from "@electric-sql/pglite";
import Database from "better-sqlite3";
import { kyselyAdapter } from "fumadb/adapters/kysely";
import {
  DummyDriver,
  Kysely,
  MysqlAdapter,
  MysqlIntrospector,
  MysqlQueryCompiler,
  SqliteDialect,
} from "kysely";
import { describe, expect, it } from "vitest";
import { migrate } from "@/cli";
import { DB_SCHEMA_VERSION, DimahS3DB } from "@/fuma-db";
import { pgliteDialect } from "@/test/databases";
import { dbSchema } from "./schema";

const DEFINITIONS = {
  storage_object: dbSchema.tables.storageObject,
  storage_folder: dbSchema.tables.storageFolder,
};
const TABLES = ["storage_object", "storage_folder"] as const;

type Index = { name: string; unique: boolean; columns: string[] };
type Shape = {
  columns: { name: string; nullable: boolean }[];
  indexes: Index[];
};

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name);

function columnList(entries: [name: string, nullable: boolean][]) {
  return entries.map(([name, nullable]) => ({ name, nullable })).sort(byName);
}

/** Columns and indexes schema 2.1.0 declares for a SQL table. */
function expectedShape(table: (typeof TABLES)[number]): Shape {
  const definition = DEFINITIONS[table];
  const sqlNames = (columns: { names: { sql: string } }[]) =>
    columns.map((column) => column.names.sql);
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
        columns: sqlNames(constraint.columns),
      })),
      ...definition.getIndexes().map((index) => ({
        name: index.name,
        unique: false,
        columns: sqlNames(index.columns),
      })),
    ].sort(byName),
  };
}

function sqliteShape(db: Database.Database, table: string) {
  const columns = db
    .prepare<
      [string],
      { name: string; type: string; notnull: number; pk: number }
    >(`SELECT "name", "type", "notnull", "pk" FROM pragma_table_info(?)`)
    .all(table);
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
  return {
    shape: {
      columns: columns
        .map((column) => ({
          name: column.name,
          nullable: column.notnull === 0 && column.pk === 0,
        }))
        .sort(byName),
      indexes: indexes.sort(byName),
    } satisfies Shape,
    types: Object.fromEntries(
      columns.map((column) => [column.name, column.type.toLowerCase()]),
    ),
  };
}

async function pgShape(pg: PGlite, table: string) {
  const columns = await pg.query<{
    name: string;
    nullable: string;
    type: string;
    length: number | null;
  }>(
    `SELECT "column_name" AS "name", "is_nullable" AS "nullable", "data_type" AS "type",
       "character_maximum_length" AS "length"
     FROM "information_schema"."columns" WHERE "table_name" = $1`,
    [table],
  );
  const indexes = await pg.query<Index>(
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
    shape: {
      columns: columns.rows
        .map((column) => ({
          name: column.name,
          nullable: column.nullable === "YES",
        }))
        .sort(byName),
      indexes: indexes.rows.sort(byName),
    } satisfies Shape,
    types: Object.fromEntries(
      columns.rows.map((column) => [
        column.name,
        column.length === null
          ? column.type
          : `${column.type}(${column.length})`,
      ]),
    ),
  };
}

/**
 * The SQL `migrate` runs on an empty MySQL database. `DummyDriver` answers
 * every query with no rows, so the migrator sees no tables and no version.
 */
async function mysqlMigrationSql(): Promise<string> {
  const db = new Kysely<object>({
    dialect: {
      createAdapter: () => new MysqlAdapter(),
      createDriver: () => new DummyDriver(),
      createIntrospector: (kysely) => new MysqlIntrospector(kysely),
      createQueryCompiler: () => new MysqlQueryCompiler(),
    },
  });
  const client = DimahS3DB.client(kyselyAdapter({ db, provider: "mysql" }));
  const plan = await client.createMigrator().migrateToLatest();
  return plan.getSQL?.() ?? "";
}

const sampleObject = {
  scope: "user:1",
  bucket: "b",
  key: "users/1/a.txt",
  route: "files",
  folderId: "folder-1",
  filename: "a.txt",
  status: "active",
  size: 5497558138880n,
  s3Metadata: { "x-amz-meta-a": "1" },
  attributes: { starred: true },
  uploadToken: "token",
};

describe("schema 2.1.0", () => {
  it("is the only schema", () => {
    expect(DimahS3DB.client(kyselyAdapter({} as never)).schemas).toEqual([
      dbSchema,
    ]);
    expect(DB_SCHEMA_VERSION).toBe("2.1.0");
  });

  it("declares the spec columns", () => {
    expect(expectedShape("storage_object").columns).toEqual(
      columnList([
        ["id", false],
        ["scope", false],
        ["bucket", false],
        ["key", false],
        ["route", false],
        ["folder_id", true],
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
        ["parent_id", false],
        ["name", false],
        ["path", false],
        ["created_at", false],
        ["updated_at", false],
      ]),
    );
  });

  it("declares the spec indexes", () => {
    expect(expectedShape("storage_object").indexes).toEqual(
      [
        {
          name: "storage_object_bucket_key_uk",
          unique: true,
          columns: ["bucket", "key"],
        },
        {
          name: "storage_object_scope_folder_idx",
          unique: false,
          columns: ["scope", "status", "folder_id", "created_at"],
        },
        {
          name: "storage_object_scope_updated_idx",
          unique: false,
          columns: ["scope", "status", "updated_at"],
        },
        {
          name: "storage_object_scope_filename_idx",
          unique: false,
          columns: ["scope", "status", "filename"],
        },
        {
          name: "storage_object_scope_size_idx",
          unique: false,
          columns: ["scope", "status", "size"],
        },
        {
          name: "storage_object_status_expires_idx",
          unique: false,
          columns: ["status", "expires_at"],
        },
      ].sort(byName),
    );
    expect(expectedShape("storage_folder").indexes).toEqual(
      [
        {
          name: "storage_folder_scope_path_uk",
          unique: true,
          columns: ["scope", "path"],
        },
        {
          name: "storage_folder_scope_parent_name_uk",
          unique: true,
          columns: ["scope", "parent_id", "name"],
        },
      ].sort(byName),
    );
  });
});

describe("migrate() on SQLite", () => {
  async function create() {
    const database = new Database(":memory:");
    const client = DimahS3DB.client(
      kyselyAdapter({
        db: new Kysely<object>({ dialect: new SqliteDialect({ database }) }),
        provider: "sqlite",
      }),
    );
    await migrate(client);
    return { database, client };
  }

  it.each(TABLES)("creates %s as declared", async (table) => {
    const { database } = await create();
    expect(sqliteShape(database, table).shape).toEqual(expectedShape(table));
  });

  it("stores sizes as integer, JSON as text, and dates as integer", async () => {
    const { database } = await create();
    expect(sqliteShape(database, "storage_object").types).toMatchObject({
      size: "integer",
      declared_size: "integer",
      s3_metadata: "text",
      created_at: "integer",
    });
  });

  it("round-trips a row", async () => {
    const { database, client } = await create();
    const orm = client.orm(DB_SCHEMA_VERSION);
    const created = await orm.create("storageObject", sampleObject);
    expect(
      await orm.findFirst("storageObject", {
        where: (b) => b("id", "=", created.id),
      }),
    ).toMatchObject({ ...sampleObject, declaredSize: null });
    expect(
      database
        .prepare(
          `SELECT typeof("size") AS "size", typeof("created_at") AS "createdAt" FROM "storage_object"`,
        )
        .get(),
    ).toEqual({ size: "integer", createdAt: "integer" });
  });
});

describe("migrate() on PostgreSQL", () => {
  async function create() {
    const pg = new PGlite();
    const client = DimahS3DB.client(
      kyselyAdapter({
        db: new Kysely<object>({ dialect: pgliteDialect(pg) }),
        provider: "postgresql",
      }),
    );
    await migrate(client);
    return { pg, client };
  }

  it.each(TABLES)("creates %s as declared", async (table) => {
    const { pg } = await create();
    expect((await pgShape(pg, table)).shape).toEqual(expectedShape(table));
  });

  it("bounds text columns and keeps sizes as int8", async () => {
    const { pg } = await create();
    expect((await pgShape(pg, "storage_object")).types).toMatchObject({
      key: "character varying(1024)",
      scope: "character varying(255)",
      status: "character varying(16)",
      upload_token: "character varying(64)",
      upload_id: "text",
      size: "bigint",
      s3_metadata: "json",
      created_at: "timestamp without time zone",
    });
    expect((await pgShape(pg, "storage_folder")).types).toMatchObject({
      path: "character varying(1024)",
      parent_id: "character varying(255)",
    });
  });

  it("round-trips a row", async () => {
    const { client } = await create();
    const orm = client.orm(DB_SCHEMA_VERSION);
    const created = await orm.create("storageObject", sampleObject);
    expect(
      await orm.findFirst("storageObject", {
        where: (b) => b("id", "=", created.id),
      }),
    ).toMatchObject(sampleObject);
  });
});

describe("migrate() on MySQL", () => {
  it("indexes long columns by prefix", async () => {
    const sql = await mysqlMigrationSql();
    expect(sql).toContain(
      "create unique index `storage_object_bucket_key_uk` on `storage_object` (`bucket`, `key`(512))",
    );
    expect(sql).toContain(
      "create unique index `storage_folder_scope_path_uk` on `storage_folder` (`scope`, `path`(512))",
    );
    expect(sql).toContain(
      "create index `storage_object_scope_folder_idx` on `storage_object` (`scope`, `status`, `folder_id`, `created_at`)",
    );
  });

  it("compares keys byte for byte and file names case-insensitively", async () => {
    const sql = await mysqlMigrationSql();
    expect(sql).toContain("`key` varchar(1024) collate utf8mb4_bin not null");
    expect(sql).toContain("`upload_id` text collate utf8mb4_bin");
    expect(sql).toContain(
      "`filename` varchar(255) collate utf8mb4_unicode_ci not null",
    );
  });

  it("keeps milliseconds", async () => {
    const sql = await mysqlMigrationSql();
    expect(sql).toContain(
      "`created_at` datetime(3) default CURRENT_TIMESTAMP(3) not null",
    );
  });
});
