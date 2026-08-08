import { DimahS3DB } from "@dimah-s3/db";
import { runCli } from "@dimah-s3/db/cli";
import { drizzleAdapter } from "fumadb/adapters/drizzle";

/** Drizzle adapter stub — enough for FumaDB `generate`; runtime uses `src/lib/dimah-s3-db.ts`. */
const db = DimahS3DB.client(
  drizzleAdapter({ db: {} as never, provider: "sqlite" }),
);

void runCli(db);
