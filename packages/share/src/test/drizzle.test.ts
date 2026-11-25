import { createHash } from "node:crypto";
import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { DimahS3Db, migrate as migrateDb } from "@dimah-s3/db";
import { drizzleAdapter } from "@dimah-s3/db/adapters/drizzle";
import { kyselyAdapter } from "@dimah-s3/db/adapters/kysely";
import { generateSchema } from "@dimah-s3/db/cli";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";
import { describe, expect, it } from "vitest";
import { DimahS3Share } from "@/fuma-db";
import { migrate } from "@/migrate";
import { createShareStore } from "@/store/create-share-store";

/** Git-ignored; Vite still transforms files here, unlike `node_modules`. */
const GENERATED_DIR = join(import.meta.dirname, "../../.vitest/generated");

/** Writes generated code once, named by its content, and imports it. */
async function importGenerated(name: string, code: string) {
  const hash = createHash("sha256").update(code).digest("hex").slice(0, 12);
  const file = join(GENERATED_DIR, `${name}-${hash}.ts`);
  if (!existsSync(file)) {
    mkdirSync(GENERATED_DIR, { recursive: true });
    const temp = `${file}.${process.pid}.tmp`;
    writeFileSync(temp, code);
    renameSync(temp, file);
  }
  return (await import(pathToFileURL(file).href)) as {
    relations: Record<string, unknown>;
  };
}

describe("Drizzle schema of share", () => {
  // `integer` columns: before FumaDB 0.8, MySQL's import of `integer` failed.
  it.each(["sqlite", "postgresql", "mysql"] as const)(
    "loads on %s",
    async (provider) => {
      const { code } = DimahS3Share.client(
        drizzleAdapter({ db: undefined, provider }),
      ).generateSchema("latest");
      const schema = await importGenerated(`share-${provider}`, code);
      expect(Object.keys(schema).sort()).toEqual([
        "private_dimah_s3_share_settings",
        "relations",
        "shareLink",
      ]);
    },
  );
});

describe("Drizzle with db and share on one instance", () => {
  it("generates both into one file that declares a shared PostgreSQL schema once", () => {
    const adapter = drizzleAdapter({ db: undefined, provider: "postgresql" });
    const { code } = generateSchema([
      DimahS3Db.names.schema("storage").client(adapter),
      DimahS3Share.names.schema("storage").client(adapter),
    ]);
    // drizzle-kit refuses a schema declared twice, and needs it exported.
    expect(code.match(/pgSchema\("storage"\)/g)).toHaveLength(1);
    expect(code).toContain('export const storageSchema = pgSchema("storage")');
    expect(code).toContain('storageSchema.table("storage_object"');
    expect(code).toContain('storageSchema.table("share_link"');
    expect(code.match(/export const relations =/g)).toHaveLength(1);
  });

  it("reads both schemas through merged relations", async () => {
    const generate = (library: typeof DimahS3Db | typeof DimahS3Share) =>
      library
        .client(drizzleAdapter({ db: undefined, provider: "sqlite" }))
        .generateSchema("latest").code;
    const dbSchema = await importGenerated("db-sqlite", generate(DimahS3Db));
    const shareSchema = await importGenerated(
      "share-sqlite",
      generate(DimahS3Share),
    );

    const sqlite = new Database(":memory:");
    const kysely = new Kysely<object>({
      dialect: new SqliteDialect({ database: sqlite }),
    });
    await migrateDb(
      DimahS3Db.client(kyselyAdapter({ db: kysely, provider: "sqlite" })),
    );
    await migrate(
      DimahS3Share.client(kyselyAdapter({ db: kysely, provider: "sqlite" })),
    );

    const db = drizzle({
      client: sqlite,
      relations: { ...dbSchema.relations, ...shareSchema.relations } as never,
    });
    const shareClient = DimahS3Share.client(
      drizzleAdapter({ db, provider: "sqlite" }),
    );
    const dbClient = DimahS3Db.client(
      drizzleAdapter({ db, provider: "sqlite" }),
    );

    const links = createShareStore(shareClient).links;
    const link = await links.create({
      token: "drizzle-token-0123456789abcdef",
      scope: "user:1",
      target: { type: "folder", folderId: "f1" },
      label: null,
      passwordHash: null,
      expiresAt: null,
      maxDownloads: null,
    });
    await expect(links.findByToken(link.token)).resolves.toMatchObject({
      id: link.id,
    });
    await expect(dbClient.version()).resolves.toBe("2.3.0");
    sqlite.close();
  });
});
