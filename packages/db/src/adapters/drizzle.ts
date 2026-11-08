/**
 * The FumaDB Drizzle adapter. Pass a Drizzle instance whose relations include
 * the tables `runCli` → `generate` writes:
 * `DimahS3DB.client(drizzleAdapter({ db, provider: "postgresql" }))`.
 */
export { drizzleAdapter, type DrizzleConfig } from "fumadb/adapters/drizzle";
