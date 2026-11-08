import { createCli } from "fumadb/cli";
import { DB_SCHEMA_VERSION, type DimahS3DbClient } from "./fuma-db";

declare const __DIMAH_S3_DB_VERSION__: string;

/**
 * Runs the FumaDB CLI for the @dimah-s3/db schema. `generate` writes the
 * Drizzle or Prisma schema for the client's adapter, and with Kysely, the SQL
 * that creates the tables. `migrate` creates them with Kysely.
 *
 * Generating does not query the database, so the client can wrap an adapter
 * that has no connection yet.
 *
 * ```ts
 * // scripts/dimah-s3.mts
 * import { DimahS3DB } from "@dimah-s3/db";
 * import { drizzleAdapter } from "@dimah-s3/db/adapters/drizzle";
 * import { runCli } from "@dimah-s3/db/cli";
 *
 * await runCli(DimahS3DB.client(drizzleAdapter({ db: undefined, provider: "postgresql" })));
 * ```
 *
 * `node scripts/dimah-s3.mts generate latest -o db/dimah-s3.ts`
 */
export function runCli(client: DimahS3DbClient): Promise<void> {
  const { main } = createCli({
    db: client,
    command: "dimah-s3-db",
    description: "FumaDB CLI for @dimah-s3/db",
    version: __DIMAH_S3_DB_VERSION__,
  });

  return main();
}

/**
 * Creates the schema this package reads, with its indexes, on an empty
 * database. It needs the Kysely adapter; with Drizzle or Prisma, generate the
 * schema with {@link runCli} and apply it with your ORM. It does nothing on a
 * database already at {@link DB_SCHEMA_VERSION}, and throws on a database at
 * another version: this package does not upgrade one.
 *
 * ```ts
 * import { DimahS3DB } from "@dimah-s3/db";
 * import { kyselyAdapter } from "@dimah-s3/db/adapters/kysely";
 * import { migrate } from "@dimah-s3/db/cli";
 *
 * await migrate(DimahS3DB.client(kyselyAdapter({ db: kysely, provider: "postgresql" })));
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
