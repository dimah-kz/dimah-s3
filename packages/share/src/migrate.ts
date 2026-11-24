import { SHARE_SCHEMA_VERSION, type DimahS3ShareClient } from "./fuma-db";

/**
 * Creates the `share_link` table and its indexes on a database that does
 * not have them. It needs the Kysely adapter; with Drizzle or Prisma,
 * generate the schema with `runCli` from `@dimah-s3/share/cli` and apply it
 * with your ORM. It does nothing on a database already at
 * {@link SHARE_SCHEMA_VERSION}, and throws on one at another version.
 *
 * ```ts
 * import { DimahS3Share, migrate } from "@dimah-s3/share";
 * import { kyselyAdapter } from "@dimah-s3/db/adapters/kysely";
 *
 * await migrate(DimahS3Share.client(kyselyAdapter({ db: kysely, provider: "postgresql" })));
 * ```
 */
export async function migrate(client: DimahS3ShareClient): Promise<void> {
  let version: string | undefined;
  try {
    version = await client.version();
  } catch {
    version = undefined;
  }
  if (version === SHARE_SCHEMA_VERSION) return;
  if (version !== undefined) {
    throw new Error(
      `[dimah-s3/share] The database is at share schema ${version}, which this package does not upgrade. It reads ${SHARE_SCHEMA_VERSION}.`,
    );
  }
  await (await client.createMigrator().migrateToLatest()).execute();
}
