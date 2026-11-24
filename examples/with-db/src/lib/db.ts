import { DimahS3Db } from "@dimah-s3/db";
import { drizzleAdapter } from "@dimah-s3/db/adapters/drizzle";
import { DimahS3Share } from "@dimah-s3/share";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { relations as dbRelations } from "../../db/dimah-s3";
import { relations as shareRelations } from "../../db/dimah-s3-share";

const sqlite = new Database(process.env.DATABASE_PATH ?? "./local.db");

/** One Drizzle instance over the tables of both plugins. */
export const db = drizzle({
  client: sqlite,
  relations: { ...dbRelations, ...shareRelations },
});

const adapter = drizzleAdapter({ db, provider: "sqlite" });

/** FumaDB client for the `db()` plugin. */
export const dimahS3Db = DimahS3Db.client(adapter);

/** FumaDB client for the `share()` plugin, on the same database. */
export const dimahS3Share = DimahS3Share.client(adapter);
