import { createCli } from "fumadb/cli";
import type { DimahS3DbClient } from "./fuma-db";

/*
 * FumaDB's `generateSchema`, so an app writes one file for several clients
 * without depending on `fumadb` itself: `@dimah-s3/db` and
 * `@dimah-s3/share` in one PostgreSQL schema declare `pgSchema()` once,
 * which drizzle-kit needs. The clients must share one adapter.
 *
 *   const adapter = drizzleAdapter({ db: undefined, provider: "postgresql" });
 *   const { code } = generateSchema([
 *     DimahS3Db.names.schema("storage").client(adapter),
 *     DimahS3Share.names.schema("storage").client(adapter),
 *   ]);
 */
export { generateSchema } from "fumadb";

declare const __DIMAH_S3_DB_VERSION__: string;

/**
 * Runs the FumaDB CLI for the @dimah-s3/db schema. `generate` writes the
 * Drizzle or Prisma schema for the client's adapter, and with Kysely, the SQL
 * that creates the tables. `migrate` creates them with Kysely; from code,
 * call `migrate(client)` from `@dimah-s3/db`.
 *
 * Generating does not query the database, so the client can wrap an adapter
 * that has no connection yet.
 *
 * ```ts
 * // scripts/dimah-s3.mts
 * import { DimahS3Db } from "@dimah-s3/db";
 * import { drizzleAdapter } from "@dimah-s3/db/adapters/drizzle";
 * import { runCli } from "@dimah-s3/db/cli";
 *
 * await runCli(DimahS3Db.client(drizzleAdapter({ db: undefined, provider: "postgresql" })));
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
