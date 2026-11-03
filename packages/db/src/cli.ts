import { createCli } from "fumadb/cli";
import { DB_SCHEMA_VERSION, type DimahS3DbClient } from "./fuma-db";
import { PREDECESSOR_VERSION } from "./schema/schema";

declare const __DIMAH_S3_DB_VERSION__: string;

/**
 * Versions `migrate` may continue from: an empty database, a migration that
 * stopped on the empty predecessor, or a database already at
 * {@link DB_SCHEMA_VERSION}.
 */
const RESUMABLE = new Set<string>([PREDECESSOR_VERSION, DB_SCHEMA_VERSION]);

/**
 * Runs the interactive FumaDB CLI: generate the ORM schema, or migrate when
 * the client uses the Kysely adapter. Prefer {@link migrate}. Only
 * `migrate:up`, one version at a time, runs the steps the schema needs,
 * including the indexes. The CLI `migrate` command jumps to the latest
 * schema and skips them.
 *
 * ```ts
 * // scripts/db.ts
 * import { runCli } from "@dimah-s3/db/cli";
 * import { dimahS3Db } from "../lib/s3";
 *
 * await runCli(dimahS3Db);
 * ```
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
 * Creates the schema this package reads, one version at a time, so the
 * schema's own steps run (the indexes among them). It needs the Kysely
 * adapter; with Drizzle or Prisma, use your ORM's migrations or the files
 * in `sql/`. It does not upgrade a database at another version.
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
  if (version !== undefined && !RESUMABLE.has(version)) {
    throw new Error(
      `[dimah-s3/db] The database is at schema ${version}, which this package does not upgrade. Create schema ${DB_SCHEMA_VERSION} on a new database.`,
    );
  }
  const migrator = client.createMigrator();
  for (let next = await migrator.next(); next; next = await migrator.next()) {
    await (await migrator.up()).execute();
  }
}
