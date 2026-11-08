import { DimahS3DB } from "@dimah-s3/db";
import { drizzleAdapter } from "@dimah-s3/db/adapters/drizzle";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { relations } from "../../db/dimah-s3";

const sqlite = new Database(process.env.DATABASE_PATH ?? "./local.db");

export const db = drizzle({ client: sqlite, relations });

/** FumaDB client for the `db()` plugin. */
export const dimahS3Db = DimahS3DB.client(
  drizzleAdapter({ db, provider: "sqlite" }),
);
