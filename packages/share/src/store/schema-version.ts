import { SHARE_SCHEMA_VERSION, type DimahS3ShareClient } from "@/fuma-db";

/** How to get the schema, for the errors below. */
const CREATE_HINT =
  "Generate the schema with runCli from @dimah-s3/share/cli and apply it with your ORM's migrations, or call migrate(client) from @dimah-s3/share with the Kysely adapter.";

/**
 * Throws unless the database is at the schema the store uses
 * ({@link SHARE_SCHEMA_VERSION}). It reads the recorded version, then one
 * row of the table, so a schema file generated without a migration still
 * fails here instead of on the first real query.
 */
export async function checkSchemaVersion(
  client: DimahS3ShareClient,
): Promise<void> {
  let version: string;
  try {
    version = await client.version();
  } catch (error) {
    throw new Error(
      `[dimah-s3/share] The database has no share schema. ${CREATE_HINT}`,
      { cause: error },
    );
  }
  if (version !== SHARE_SCHEMA_VERSION) {
    throw new Error(
      `[dimah-s3/share] The database is at share schema ${version}, but @dimah-s3/share reads ${SHARE_SCHEMA_VERSION}. Keep every @dimah-s3/* package on the same version. ${CREATE_HINT}`,
    );
  }
  try {
    await client.orm(SHARE_SCHEMA_VERSION).findFirst("shareLink", {});
  } catch (error) {
    throw new Error(
      `[dimah-s3/share] The share_link table does not match share schema ${SHARE_SCHEMA_VERSION}: reading it failed. The schema was not applied to this database. ${CREATE_HINT}`,
      { cause: error },
    );
  }
}
