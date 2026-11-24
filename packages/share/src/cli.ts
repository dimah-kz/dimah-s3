import { createCli } from "fumadb/cli";
import type { DimahS3ShareClient } from "./fuma-db";

declare const __DIMAH_S3_SHARE_VERSION__: string;

/**
 * Runs the FumaDB CLI for the @dimah-s3/share schema. `generate` writes the
 * Drizzle or Prisma schema for the client's adapter, and with Kysely, the
 * SQL that creates the table. `migrate` creates it with Kysely; from code,
 * call `migrate(client)` from `@dimah-s3/share`.
 *
 * Generating does not query the database, so the client can wrap an
 * adapter that has no connection yet.
 *
 * ```ts
 * // scripts/dimah-s3-share.mts
 * import { drizzleAdapter } from "@dimah-s3/db/adapters/drizzle";
 * import { DimahS3Share } from "@dimah-s3/share";
 * import { runCli } from "@dimah-s3/share/cli";
 *
 * await runCli(DimahS3Share.client(drizzleAdapter({ db: undefined, provider: "postgresql" })));
 * ```
 *
 * `node scripts/dimah-s3-share.mts generate latest -o db/dimah-s3-share.ts`
 */
export function runCli(client: DimahS3ShareClient): Promise<void> {
  const { main } = createCli({
    db: client,
    command: "dimah-s3-share",
    description: "FumaDB CLI for @dimah-s3/share",
    version: __DIMAH_S3_SHARE_VERSION__,
  });

  return main();
}
