import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AnyColumn as Column } from "fumadb/schema";
import { describe, expect, it } from "vitest";
import { DB_SCHEMA_VERSION } from "@/fuma-db";
import { dbSchema, schemaIndexes } from "@/schema/schema";

const PRISMA_SCHEMA = join(import.meta.dirname, "../../prisma/dimah-s3.prisma");

type Field = {
  name: string;
  type: string;
  optional: boolean;
  attributes: string;
};
type Model = {
  name: string;
  table: string;
  fields: Field[];
  indexes: { name: string; unique: boolean; fields: string[] }[];
};

/** Reads the models of `prisma/dimah-s3.prisma`. Comments are skipped. */
function readModels(): Model[] {
  const text = readFileSync(PRISMA_SCHEMA, "utf8");
  return [...text.matchAll(/^model (\w+) \{\n([\s\S]*?)\n\}/gm)].map(
    ([, name, body]) => {
      const model: Model = { name, table: name, fields: [], indexes: [] };
      for (const raw of body.split("\n")) {
        const line = raw.trim();
        if (line === "" || line.startsWith("//")) continue;
        const table = /^@@map\("(\w+)"\)$/.exec(line);
        const index = /^@@(unique|index)\(\[(.+)\], map: "(\w+)"\)$/.exec(line);
        const field = /^(\w+) +(\w+)(\??)(?: +(\S.*))?$/.exec(line);
        if (table) {
          model.table = table[1];
        } else if (index) {
          model.indexes.push({
            name: index[3],
            unique: index[1] === "unique",
            fields: index[2].split(",").map((f) => f.trim()),
          });
        } else if (field) {
          model.fields.push({
            name: field[1],
            type: field[2],
            optional: field[3] === "?",
            attributes: field[4] ?? "",
          });
        } else {
          throw new Error(`Unexpected line in the Prisma schema: ${line}`);
        }
      }
      return model;
    },
  );
}

const PRISMA_TYPES: Record<string, string> = {
  string: "String",
  bigint: "BigInt",
  json: "Json",
  timestamp: "DateTime",
};

const prismaType = (type: string) =>
  type.startsWith("varchar") ? "String" : PRISMA_TYPES[type];

const sqlName = (field: Field) =>
  /@map\("(\w+)"\)/.exec(field.attributes)?.[1] ?? field.name;

/** The argument of `@default(...)`, such as `cuid()` or `"2.0.0"`. */
const prismaDefault = (field: Field) =>
  /@default\(((?:[^()]|\(\))*)\)/.exec(field.attributes)?.[1];

/** The Prisma default FumaDB's own Prisma generator emits for a column. */
function fumaDefault(value: Column["default"]): string | undefined {
  if (!value) return undefined;
  if ("value" in value) return JSON.stringify(value.value);
  if (value.runtime === "auto") return "cuid()";
  if (value.runtime === "now") return "now()";
  return undefined;
}

const lowerFirst = (name: string) =>
  name.charAt(0).toLowerCase() + name.slice(1);

describe("prisma/dimah-s3.prisma", () => {
  const models = readModels();

  it.each(["storageObject", "storageFolder"] as const)(
    "matches the FumaDB definition of %s",
    (key) => {
      const definition = dbSchema.tables[key];
      const model = models.find((m) => m.table === definition.names.sql);
      expect(model).toBeDefined();
      if (!model) return;
      // FumaDB calls `prisma[<table key>]`, the client's name for the model.
      expect(lowerFirst(model.name)).toBe(key);

      expect(
        model.fields.map((field) => ({
          name: field.name,
          column: sqlName(field),
          type: field.type,
          optional: field.optional,
          default: prismaDefault(field),
        })),
      ).toEqual(
        Object.values(definition.columns).map((column) => ({
          name: column.ormName,
          column: column.names.sql,
          type: prismaType(column.type),
          optional: column.isNullable,
          default: fumaDefault(column.default),
        })),
      );
      expect(model.fields.find((f) => f.name === "id")?.attributes).toMatch(
        /^@id /,
      );

      const ormName = (name: string) =>
        definition.getColumnByName(name, "sql")?.ormName;
      expect(
        model.indexes.sort((a, b) => a.name.localeCompare(b.name)),
      ).toEqual(
        [
          ...definition.getUniqueConstraints().map((constraint) => ({
            name: constraint.name,
            unique: true,
            fields: constraint.columns.map((column) => column.ormName),
          })),
          ...schemaIndexes
            .filter((index) => index.table === definition.names.sql)
            .map((index) => ({
              name: index.name,
              unique: false,
              fields: index.columns.map(ormName),
            })),
        ].sort((a, b) => a.name.localeCompare(b.name)),
      );
    },
  );

  it("declares the settings model the FumaDB Prisma adapter reads", () => {
    const settings = models.find((m) => m.name === "private_dimah_s3_settings");
    expect(settings?.table).toBe("private_dimah_s3_settings");
    expect(settings?.fields).toEqual([
      { name: "key", type: "String", optional: false, attributes: "@id" },
      {
        name: "value",
        type: "String",
        optional: false,
        attributes: `@default("${DB_SCHEMA_VERSION}")`,
      },
    ]);
  });

  it("has no other models", () => {
    expect(models.map((m) => m.table).sort()).toEqual([
      "private_dimah_s3_settings",
      "storage_folder",
      "storage_object",
    ]);
  });
});
