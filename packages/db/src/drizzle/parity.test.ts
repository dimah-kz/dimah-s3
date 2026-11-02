import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import Database from "better-sqlite3";
import {
  defineRelations,
  getTableColumns,
  is,
  SQL,
  StringChunk,
  type Table,
} from "drizzle-orm";
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import {
  getTableConfig as mysqlTableConfig,
  type MySqlTable,
} from "drizzle-orm/mysql-core";
import {
  getTableConfig as pgTableConfig,
  type PgTable,
} from "drizzle-orm/pg-core";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import {
  getTableConfig as sqliteTableConfig,
  type SQLiteTable,
} from "drizzle-orm/sqlite-core";
import { afterEach, describe, expect, it } from "vitest";
import { drizzleAdapter } from "@/adapters/drizzle";
import { DB_SCHEMA_VERSION, DimahS3DB, type DimahS3DbClient } from "@/fuma-db";
import { dbSchema, schemaIndexes } from "@/schema/schema";
import * as mysql from "./mysql";
import * as pg from "./pg";
import { DIMAH_S3_SCHEMA_VERSION } from "./shared";
import * as sqlite from "./sqlite";

const SQL_DIR = join(import.meta.dirname, "../../sql");
const SETTINGS = "private_dimah_s3_settings" as const;
const TABLE_KEYS = ["storageObject", "storageFolder"] as const;

type ColumnShape = {
  name: string;
  type: string;
  notNull: boolean;
  primary: boolean;
  default: string | null;
};
type IndexShape = { name: string; unique: boolean; columns: string[] };
type TableShape = { columns: ColumnShape[]; indexes: IndexShape[] };

/** The parts of a Drizzle table config the comparison reads, for every dialect. */
type DrizzleTableConfig = {
  name: string;
  columns: {
    name: string;
    notNull: boolean;
    primary: boolean;
    default?: unknown;
    getSQLType(): string;
  }[];
  indexes: {
    config: { name?: string; unique?: boolean; columns: unknown[] };
  }[];
  uniqueConstraints: { name?: string; columns: { name: string }[] }[];
};

type TableKey = keyof typeof sqlite.dimahS3Tables;

function tableConfigs<TTable extends Table>(
  tables: Record<TableKey, TTable>,
  read: (table: TTable) => DrizzleTableConfig,
): Record<TableKey, DrizzleTableConfig> {
  return {
    storageObject: read(tables.storageObject),
    storageFolder: read(tables.storageFolder),
    [SETTINGS]: read(tables[SETTINGS]),
  };
}

const dialects = [
  {
    name: "sqlite",
    module: sqlite,
    configs: tableConfigs<SQLiteTable>(sqlite.dimahS3Tables, sqliteTableConfig),
  },
  {
    name: "pg",
    module: pg,
    configs: tableConfigs<PgTable>(pg.dimahS3Tables, pgTableConfig),
  },
  {
    name: "mysql",
    module: mysql,
    configs: tableConfigs<MySqlTable>(mysql.dimahS3Tables, mysqlTableConfig),
  },
] as const;

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name);

/** Renders an index column or a column default the way the SQL files spell it. */
function render(value: unknown): string {
  if (is(value, SQL)) return value.queryChunks.map(render).join("");
  if (is(value, StringChunk)) return value.value;
  if (typeof value === "string") return `'${value}'`;
  if (typeof value === "object" && value !== null && "name" in value) {
    return String(value.name);
  }
  throw new Error(`Cannot render ${String(value)}`);
}

function drizzleShape(config: DrizzleTableConfig): TableShape {
  return {
    columns: config.columns
      .map((column) => ({
        name: column.name,
        type: column.getSQLType().toLowerCase(),
        notNull: column.notNull,
        primary: column.primary,
        default: column.default === undefined ? null : render(column.default),
      }))
      .sort(byName),
    indexes: [
      ...config.indexes.map(({ config: index }) => ({
        name: index.name ?? "",
        unique: Boolean(index.unique),
        columns: index.columns.map(render),
      })),
      ...config.uniqueConstraints.map((constraint) => ({
        name: constraint.name ?? "",
        unique: true,
        columns: constraint.columns.map((column) => column.name),
      })),
    ].sort(byName),
  };
}

const unquote = (value: string) => value.replaceAll(/[`"]/g, "");
const splitColumns = (list: string) =>
  list.split(",").map((c) => unquote(c.trim()));

/** Reads every table of `sql/<dialect>.sql`, by SQL table name. */
function sqlFileShapes(dialect: string): Map<string, TableShape> {
  const text = readFileSync(join(SQL_DIR, `${dialect}.sql`), "utf8");
  const shapes = new Map<string, TableShape>();

  for (const [, table, body] of text.matchAll(
    /CREATE TABLE [`"](\w+)[`"] \(\n([\s\S]*?)\n\)/g,
  )) {
    const shape: TableShape = { columns: [], indexes: [] };
    for (const raw of body.split("\n")) {
      const line = raw.trim().replace(/,$/, "");
      const column = /^[`"](\w+)[`"] (\w+(?:\(\d+\))?)((?: .*)?)$/.exec(line);
      const primaryKey = /^PRIMARY KEY \((.+)\)$/.exec(line);
      const index =
        /^(?:CONSTRAINT [`"](\w+)[`"] (UNIQUE)|(UNIQUE )?KEY [`"](\w+)[`"]) \((.+)\)$/.exec(
          line,
        );
      if (column) {
        const [, name, type, rest] = column;
        const primary = rest.includes("PRIMARY KEY");
        const defaultValue = /DEFAULT (.+)$/.exec(rest)?.[1] ?? null;
        shape.columns.push({
          name,
          type: type.toLowerCase(),
          notNull: primary || rest.includes("NOT NULL"),
          primary,
          default: defaultValue?.replace(/^\(('.*')\)$/, "$1") ?? null,
        });
      } else if (primaryKey) {
        for (const name of splitColumns(primaryKey[1])) {
          const target = shape.columns.find((c) => c.name === name);
          if (target) Object.assign(target, { primary: true, notNull: true });
        }
      } else if (index) {
        const [, constraint, unique, uniqueKey, key, columns] = index;
        shape.indexes.push({
          name: constraint ?? key,
          unique: Boolean(unique ?? uniqueKey),
          columns: splitColumns(columns),
        });
      }
    }
    shapes.set(table, shape);
  }

  for (const [, unique, name, table, columns] of text.matchAll(
    /CREATE (UNIQUE )?INDEX "(\w+)" ON "(\w+)" \((.+)\);/g,
  )) {
    shapes.get(table)?.indexes.push({
      name,
      unique: Boolean(unique),
      columns: splitColumns(columns),
    });
  }

  for (const shape of shapes.values()) {
    shape.columns.sort(byName);
    shape.indexes.sort(byName);
  }
  return shapes;
}

/** Index columns without a MySQL prefix length, such as `key(512)`. */
const withoutPrefix = (columns: string[]) =>
  columns.map((column) => column.replace(/\(\d+\)$/, ""));

describe.each(dialects)("drizzle/$name", ({ name, module, configs }) => {
  it("keys every table the way the FumaDB Drizzle adapter looks it up", () => {
    expect(Object.keys(module.dimahS3Tables).sort()).toEqual(
      [...TABLE_KEYS, SETTINGS].sort(),
    );
    expect(module.dimahS3Tables.storageObject).toBe(module.storageObject);
    expect(module.dimahS3Tables.storageFolder).toBe(module.storageFolder);
    expect(module.dimahS3Tables[SETTINGS]).toBe(module.dimahS3Settings);
  });

  it.each(TABLE_KEYS)("matches the FumaDB definition of %s", (key) => {
    const definition = dbSchema.tables[key];
    const byKey = (a: { key: string }, b: { key: string }) =>
      a.key.localeCompare(b.key);
    expect(
      Object.entries(getTableColumns(module.dimahS3Tables[key]))
        .map(([ormName, column]) => ({
          key: ormName,
          name: column.name,
          notNull: column.notNull,
        }))
        .sort(byKey),
    ).toEqual(
      Object.entries(definition.columns)
        .map(([ormName, column]) => ({
          key: ormName,
          name: column.names.sql,
          notNull: !column.isNullable,
        }))
        .sort(byKey),
    );

    const table = configs[key];
    expect(table.name).toBe(definition.names.sql);
    const indexes = drizzleShape(table).indexes.map((index) => ({
      ...index,
      columns: withoutPrefix(index.columns),
    }));
    expect(indexes).toEqual(
      [
        ...definition.getUniqueConstraints().map((constraint) => ({
          name: constraint.name,
          unique: true,
          columns: constraint.columns.map((column) => column.names.sql),
        })),
        ...schemaIndexes
          .filter((index) => index.table === definition.names.sql)
          .map((index) => ({
            name: index.name,
            unique: false,
            columns: [...index.columns],
          })),
      ].sort(byName),
    );
  });

  it("declares the same columns, defaults and indexes as the SQL file", () => {
    const shapes = Object.values(configs).map(
      (table) => [table.name, drizzleShape(table)] as const,
    );
    expect(new Map(shapes)).toEqual(sqlFileShapes(name));
  });

  it("reports the current schema version to the adapter", () => {
    expect(module.dimahS3Settings.version.default).toBe(DB_SCHEMA_VERSION);
  });
});

/** Collation of each text column of `sql/mysql.sql`, by `table.column`. */
function mysqlFileCollations(): Map<string, string> {
  const text = readFileSync(join(SQL_DIR, "mysql.sql"), "utf8");
  const collations = new Map<string, string>();
  for (const [, table, body, tableCollation] of text.matchAll(
    /CREATE TABLE `(\w+)` \(\n([\s\S]*?)\n\)[^;]*COLLATE=(\w+);/g,
  )) {
    for (const [, column, collation] of body.matchAll(
      /^\s*`(\w+)` (?:varchar|text)\b(?:\(\d+\))?(?: COLLATE (\w+))?/gm,
    )) {
      collations.set(`${table}.${column}`, collation ?? tableCollation);
    }
  }
  return collations;
}

it("gives the MySQL text columns the collations of the SQL file", () => {
  const collations = new Map<string, string | undefined>();
  for (const table of Object.values(mysql.dimahS3Tables)) {
    const config = mysqlTableConfig(table);
    for (const column of config.columns) {
      if ("collation" in column) {
        collations.set(
          `${config.name}.${column.name}`,
          column.collation as string | undefined,
        );
      }
    }
  }
  const expected = mysqlFileCollations();
  expect(expected.get("storage_object.filename")).toBe("utf8mb4_unicode_ci");
  expect(expected.get("storage_object.key")).toBe("utf8mb4_bin");
  expect(collations).toEqual(expected);
});

it("keeps the shared schema version in sync with FumaDB", () => {
  expect(DIMAH_S3_SCHEMA_VERSION).toBe(DB_SCHEMA_VERSION);
});

describe("FumaDB Drizzle adapter on the shipped tables", () => {
  const cleanups: (() => Promise<void> | void)[] = [];
  afterEach(async () => {
    for (const cleanup of cleanups.splice(0)) await cleanup();
  });

  function sqliteClient(): DimahS3DbClient {
    const database = new Database(":memory:");
    cleanups.push(() => {
      database.close();
    });
    database.exec(readFileSync(join(SQL_DIR, "sqlite.sql"), "utf8"));
    const db = drizzleSqlite({
      client: database,
      relations: defineRelations(sqlite.dimahS3Tables),
    });
    return DimahS3DB.client(drizzleAdapter({ db, provider: "sqlite" }));
  }

  async function pgClient(): Promise<DimahS3DbClient> {
    const database = new PGlite();
    cleanups.push(() => database.close());
    await database.exec(readFileSync(join(SQL_DIR, "pg.sql"), "utf8"));
    const db = drizzlePglite({
      client: database,
      relations: defineRelations(pg.dimahS3Tables),
    });
    return DimahS3DB.client(drizzleAdapter({ db, provider: "postgresql" }));
  }

  it.each([
    ["sqlite", async () => sqliteClient()],
    ["pg", pgClient],
  ] as const)("round-trips rows on %s", async (_, connect) => {
    const client = await connect();
    expect(await client.version()).toBe(DB_SCHEMA_VERSION);
    const orm = client.orm(DB_SCHEMA_VERSION);

    const expiresAt = new Date("2026-01-02T03:04:05.678Z");
    const input = {
      scope: "user:1",
      bucket: "uploads",
      key: "user-1/report.pdf",
      route: "documents",
      folder: "reports/2026",
      filename: "report.pdf",
      contentType: "application/pdf",
      declaredSize: 5_000_000_000,
      status: "pending",
      s3Metadata: { origin: "web" },
      attributes: { tags: ["q1"] },
      uploadToken: "token-1",
      expiresAt,
    };
    const created = await orm.create("storageObject", input);
    expect(created.id).toEqual(expect.any(String));

    const row = await orm.findFirst("storageObject", {
      where: (b) => b("key", "=", input.key),
    });
    expect(row).toMatchObject({
      ...input,
      id: created.id,
      size: null,
      uploadId: null,
      deletedAt: null,
    });
    expect(row?.createdAt).toBeInstanceOf(Date);
    expect(row?.updatedAt).toBeInstanceOf(Date);

    await orm.create("storageFolder", {
      scope: "user:1",
      path: "reports/2026",
      parent: "reports",
      name: "2026",
    });
    const folders = await orm.findMany("storageFolder", {
      where: (b) => b("parent", "=", "reports"),
    });
    expect(folders).toEqual([
      expect.objectContaining({ path: "reports/2026", name: "2026" }),
    ]);
  });
});
