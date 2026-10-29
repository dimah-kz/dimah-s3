import { DimahS3DB } from "@dimah-s3/db";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import { drizzleAdapter } from "fumadb/adapters/drizzle";
import { relations, storageObject } from "../db/dimah-s3";

const config = getTableConfig(storageObject);
console.log("columns", config.columns.map((column) => column.name).join(", "));

const sqlite = new Database(":memory:");
const db = drizzle({ client: sqlite, relations });
const rels = db._.relations;
console.log("relation keys", Object.keys(rels));
for (const [name, entry] of Object.entries(rels)) {
  const table = entry?.table;
  console.log(name, {
    hasTable: Boolean(table),
    keys: table ? Object.keys(table).slice(0, 8) : [],
    configName: table ? getTableConfig(table).name : undefined,
  });
}

const client = DimahS3DB.client(drizzleAdapter({ db, provider: "sqlite" }));
try {
  console.log("schema version", await client.version());
} catch (error) {
  console.log(
    "schema version",
    error instanceof Error ? error.message : String(error),
  );
}

sqlite.exec(`
CREATE TABLE storage_object (
  id text primary key not null,
  scope text not null,
  bucket text not null,
  key text not null,
  route text not null,
  content_type text,
  size blob,
  e_tag text,
  filename text,
  status text not null,
  metadata blob,
  acl text,
  upload_id text,
  declared_size blob,
  confirmed_at integer,
  expires_at integer,
  created_at integer not null,
  updated_at integer not null,
  deleted_at integer
);
`);

const inserted = await db
  .insert(storageObject)
  .values({
    scope: "user:1",
    bucket: "b",
    key: "k",
    route: "uploads",
    status: "pending",
  })
  .returning();

const createdAt = inserted[0]?.createdAt;
console.log("inserted", inserted[0]?.id, createdAt?.toISOString());

if (
  !(createdAt instanceof Date) ||
  Math.abs(createdAt.getTime() - Date.now()) > 120_000
) {
  throw new Error(`createdAt is not unix seconds: ${String(createdAt)}`);
}

const rows = await db.select().from(storageObject);
if (rows.length !== 1 || !rows[0]?.id) {
  throw new Error(`unexpected rows: ${JSON.stringify(rows)}`);
}

console.log("ok");
