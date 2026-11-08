import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DB_SCHEMA_VERSION } from "./fuma-db";
import {
  drizzleSchemaCode,
  importDrizzleSchema,
  prismaSchemaCode,
} from "./test/generated-schema";

const EXAMPLE_SCHEMA = join(
  import.meta.dirname,
  "../../../examples/with-db/db/dimah-s3.ts",
);

describe("runCli generate", () => {
  it.each(["sqlite", "postgresql", "mysql"] as const)(
    "writes a Drizzle schema that loads on %s",
    async (provider) => {
      const schema = (await importDrizzleSchema(provider)) as Record<
        string,
        unknown
      >;
      expect(Object.keys(schema).sort()).toEqual([
        "private_dimah_s3_settings",
        "relations",
        "storageFolder",
        "storageObject",
      ]);
      expect(drizzleSchemaCode(provider)).toContain(
        `.default("${DB_SCHEMA_VERSION}")`,
      );
    },
  );

  it("keeps the MySQL prefix lengths, collations, and milliseconds for Drizzle", () => {
    const code = drizzleSchemaCode("mysql");
    expect(code).toContain(
      'uniqueIndex("storage_object_bucket_key_uk").on(table.bucket, sql`${table.key}(512)`)',
    );
    expect(code).toContain(
      'key: varchar("key", { length: 1024 }).collate("utf8mb4_bin").notNull()',
    );
    expect(code).toContain(
      'filename: varchar("filename", { length: 255 }).collate("utf8mb4_unicode_ci").notNull()',
    );
    expect(code).toContain(
      'createdAt: datetime("created_at", { fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`)',
    );
  });

  it("keeps index names and MySQL prefix lengths for Prisma", () => {
    const code = prismaSchemaCode("mysql");
    expect(code).toContain(
      '@@unique([bucket, key(length: 512)], map: "storage_object_bucket_key_uk")',
    );
    expect(code).toContain(
      '@@index([scope, status, folderId, createdAt], map: "storage_object_scope_folder_idx")',
    );
    expect(code).toContain("key String @db.VarChar(1024)");
    // The settings `value` is text everywhere, so it holds Kysely's name variants.
    expect(code).toContain(
      `value String @db.Text @default(dbgenerated("('${DB_SCHEMA_VERSION}')"))`,
    );
  });

  it("wrote the schema in examples/with-db", () => {
    const example = readFileSync(EXAMPLE_SCHEMA, "utf8").replaceAll(
      "\r\n",
      "\n",
    );
    expect(example, "run `pnpm db:generate` in examples/with-db").toBe(
      drizzleSchemaCode("sqlite"),
    );
  });
});
