/**
 * The FumaDB Drizzle adapter. Pass a Drizzle instance whose relations include
 * the tables `runCli` → `generate` writes:
 * `DimahS3Db.client(drizzleAdapter({ db, provider: "postgresql" }))`.
 */
export { drizzleAdapter, type DrizzleConfig } from "fumadb/adapters/drizzle";
