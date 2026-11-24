/**
 * The FumaDB CLI for `@dimah-s3/share`. `generate` writes the Drizzle table
 * to `db/dimah-s3-share.ts`; it needs the dialect, not a connection.
 *
 *   pnpm db:generate
 */
import { drizzleAdapter } from "@dimah-s3/db/adapters/drizzle";
import { DimahS3Share } from "@dimah-s3/share";
import { runCli } from "@dimah-s3/share/cli";

await runCli(
  DimahS3Share.client(drizzleAdapter({ db: undefined, provider: "sqlite" })),
);
