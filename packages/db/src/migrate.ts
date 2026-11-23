import { DB_SCHEMA_VERSION, type DimahS3DbClient } from "./fuma-db";

/**
 * Creates the schema this package reads, with its indexes, on an empty
 * database. It needs the Kysely adapter; with Drizzle or Prisma, generate the
 * schema with `runCli` from `@dimah-s3/db/cli` and apply it with your ORM. It does nothing on a
 * database already at {@link DB_SCHEMA_VERSION}, and throws on a database at
 * another version: this package does not upgrade one.
 *
 * ```ts
 * import { DimahS3Db, migrate } from "@dimah-s3/db";
 * import { kyselyAdapter } from "@dimah-s3/db/adapters/kysely";
 *
 * await migrate(DimahS3Db.client(kyselyAdapter({ db: kysely, provider: "postgresql" })));
 * ```
 */
export async function migrate(client: DimahS3DbClient): Promise<void> {
  let version: string | undefined;
  try {
    version = await client.version();
  } catch {
    version = undefined;
  }
  if (version === DB_SCHEMA_VERSION) return;
  if (version !== undefined) {
    throw new Error(
      `[dimah-s3/db] The database is at schema ${version}, which this package does not upgrade. Create schema ${DB_SCHEMA_VERSION} on a new database.`,
    );
  }
  await (await client.createMigrator().migrateToLatest()).execute();
}
