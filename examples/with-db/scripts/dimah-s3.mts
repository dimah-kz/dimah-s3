/**
 * The FumaDB CLI for `@dimah-s3/db`. `generate` writes the Drizzle tables to
 * `db/dimah-s3.ts`; it needs the dialect, not a connection.
 *
 *   pnpm db:generate
 */
import { DimahS3Db } from "@dimah-s3/db";
import { drizzleAdapter } from "@dimah-s3/db/adapters/drizzle";
import { runCli } from "@dimah-s3/db/cli";

await runCli(
  DimahS3Db.client(drizzleAdapter({ db: undefined, provider: "sqlite" })),
);
