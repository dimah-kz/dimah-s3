import { DB_SCHEMA_VERSION, type DimahS3DbClient } from "@/fuma-db";

/** How to get the schema, for the errors below. */
const CREATE_HINT =
  "Generate the schema with runCli from @dimah-s3/db/cli and apply it with your ORM's migrations, or call migrate(client) from @dimah-s3/db with the Kysely adapter.";

/**
 * Throws unless the database is at the schema the stores use
 * ({@link DB_SCHEMA_VERSION}). It reads the recorded version, then one row
 * of each table: with Drizzle the version comes from the generated schema
 * file, so a file generated again without a migration still reads as
 * current, and only a query shows that a column is missing.
 */
export async function checkSchemaVersion(
  client: DimahS3DbClient,
): Promise<void> {
  let version: string;
  try {
    version = await client.version();
  } catch (error) {
    throw new Error(
      `[dimah-s3/db] The database has no dimah-s3 schema. ${CREATE_HINT}`,
      { cause: error },
    );
  }
  if (isNewer(version, DB_SCHEMA_VERSION)) {
    throw new Error(
      `[dimah-s3/db] The database is at schema ${version}, newer than the ${DB_SCHEMA_VERSION} this @dimah-s3/db reads. Upgrade @dimah-s3/db on every instance.`,
    );
  }
  if (version !== DB_SCHEMA_VERSION) {
    throw new Error(
      `[dimah-s3/db] The database is at schema ${version}, but @dimah-s3/db reads ${DB_SCHEMA_VERSION}. This package does not upgrade another schema: create ${DB_SCHEMA_VERSION} on a new database. ${CREATE_HINT}`,
    );
  }

  const orm = client.orm(DB_SCHEMA_VERSION);
  for (const table of ["storageObject", "storageFolder"] as const) {
    try {
      await orm.findFirst(table, {});
    } catch (error) {
      throw new Error(
        `[dimah-s3/db] The ${TABLE_NAMES[table]} table does not match schema ${DB_SCHEMA_VERSION}: reading it failed. The schema was not applied to this database. ${CREATE_HINT}`,
        { cause: error },
      );
    }
  }
}

const TABLE_NAMES = {
  storageObject: "storage_object",
  storageFolder: "storage_folder",
} as const;

/** Whether semver `a` is above `b`. */
function isNewer(a: string, b: string): boolean {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference > 0;
  }
  return false;
}
