import { createCli } from "fumadb/cli";
import type { InferFumaDB } from "fumadb";
import { DimahS3DB } from "./fuma-db";

declare const __DIMAH_S3_DB_VERSION__: string;

/** Run the interactive FumaDB CLI (generate schema, migrate when using Kysely, etc.). */
export function runCli(db: InferFumaDB<typeof DimahS3DB>) {
  const { main } = createCli({
    db,
    command: "dimah-s3-db",
    description: "FumaDB CLI for @dimah-s3/db",
    version: __DIMAH_S3_DB_VERSION__,
  });

  return main();
}
