import { DB_SCHEMA_VERSION, type DimahS3DbClient } from "@/fuma-db";

/**
 * Throws unless the database is at the schema the stores use
 * ({@link DB_SCHEMA_VERSION}).
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
  if (isNewer(version, DB_SCHEMA_VERSION)) {
    throw new Error(
      `[dimah-s3/db] The database is at schema ${version}, newer than the ${DB_SCHEMA_VERSION} this @dimah-s3/db reads. Upgrade @dimah-s3/db on every instance.`,
    );
  }
  if (version !== DB_SCHEMA_VERSION) {
    throw new Error(
      `[dimah-s3/db] The database is at schema ${version}, but @dimah-s3/db reads ${DB_SCHEMA_VERSION}. This package does not upgrade another schema. Create it with sql/<dialect>.sql, your ORM's migrations, or migrate(client) from @dimah-s3/db/cli.`,
    );
  }
}

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
