import { DB_SCHEMA_VERSION, type DimahS3DbClient } from "@/fuma-db";

/**
 * Throws unless the database is at the schema the stores use
 * ({@link DB_SCHEMA_VERSION}). A 1.x database must be upgraded first.
 */
export async function checkSchemaVersion(
  client: DimahS3DbClient,
): Promise<void> {
  let version: string;
  try {
    version = await client.version();
  } catch (error) {
    throw new Error(
      `[dimah-s3/db] The database has no dimah-s3 schema. Create it with sql/<dialect>.sql, your ORM's migrations, or migrate(client) from @dimah-s3/db/cli.`,
      { cause: error },
    );
  }
  if (version !== DB_SCHEMA_VERSION) {
    throw new Error(
      `[dimah-s3/db] The database is at schema ${version}, but @dimah-s3/db needs ${DB_SCHEMA_VERSION}. Run sql/upgrade/${version}-${DB_SCHEMA_VERSION}/<dialect>.sql or migrate(client) from @dimah-s3/db/cli.`,
    );
  }
}
