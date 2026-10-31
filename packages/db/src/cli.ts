import { createCli } from "fumadb/cli";
import { DB_SCHEMA_VERSION, type DimahS3DbClient } from "./fuma-db";
import { v1 } from "./schema/v1";

declare const __DIMAH_S3_DB_VERSION__: string;

/** Rows `migrate` rewrites per query. */
const MIGRATE_BATCH = 500;

/**
 * Runs the interactive FumaDB CLI: generate the ORM schema, or migrate when
 * the client uses the Kysely adapter. Prefer {@link migrate} to migrate:
 * only `migrate:up`, one version at a time, runs the steps 2.0.0 needs,
 * and no CLI command converts 1.x SQLite sizes.
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
 * Migrates the database to the schema this version needs, from an empty
 * database or from schema 1.0.0, one version at a time, so each version's
 * own steps run (the 2.0.0 indexes among them). An upgrade from 1.0.0 also
 * turns 1.x SQLite blob sizes into numbers, like
 * `sql/upgrade/1.0.0-2.0.0/sqlite.sql`. It needs the Kysely adapter; with
 * Drizzle or Prisma, use your ORM's migrations or the files in `sql/`.
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
  const migrator = client.createMigrator();
  for (let next = await migrator.next(); next; next = await migrator.next()) {
    const from = await migrator.getVersion();
    await (await migrator.up()).execute();
    if (from === v1.version) await rewriteSizes(client);
  }
}

/**
 * Rewrites the sizes 1.x stored as FumaDB bigints. SQLite kept those as
 * 8-byte blobs, which sort after every number. FumaDB reads a blob back as
 * a bigint and stores a number as a number.
 */
async function rewriteSizes(client: DimahS3DbClient): Promise<void> {
  const orm = client.orm(DB_SCHEMA_VERSION);
  const toNumber = (value: number | bigint | string | null) =>
    value === null ? null : Number(value);
  let after: string | undefined;
  for (;;) {
    const rows = await orm.findMany("storageObject", {
      select: ["id", "size", "declaredSize"],
      where: (b) =>
        b.and(
          b.or(b.isNotNull("size"), b.isNotNull("declaredSize")),
          after === undefined || b("id", ">", after),
        ),
      orderBy: [["id", "asc"]],
      limit: MIGRATE_BATCH,
    });
    for (const row of rows) {
      if (
        typeof row.size !== "bigint" &&
        typeof row.declaredSize !== "bigint"
      ) {
        continue;
      }
      await orm.updateMany("storageObject", {
        where: (b) => b("id", "=", row.id),
        set: {
          size: toNumber(row.size),
          declaredSize: toNumber(row.declaredSize),
        },
      });
    }
    if (rows.length < MIGRATE_BATCH) return;
    after = rows.at(-1)?.id;
  }
}
