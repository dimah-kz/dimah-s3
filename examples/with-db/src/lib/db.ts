import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { relations } from "../../db/dimah-s3";

const databasePath = process.env.DATABASE_PATH ?? "./local.db";

const sqlite = new Database(databasePath);

export const db = drizzle({ client: sqlite, relations });
