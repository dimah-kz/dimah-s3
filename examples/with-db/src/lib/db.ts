import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { drizzleAdapter } from "fumadb/adapters/drizzle";
import { DimahS3DB } from "@dimah-s3/db";
import * as schema from "../../db/dimah-s3";

const databasePath = process.env.DATABASE_PATH ?? "./local.db";

const sqlite = new Database(databasePath);

export const drizzleDb = drizzle(sqlite, { schema });

export const dimahS3Db = DimahS3DB.client(
  drizzleAdapter({
    db: drizzleDb,
    provider: "sqlite",
  }),
);
