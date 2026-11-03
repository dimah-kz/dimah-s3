/**
 * The FumaDB Drizzle adapter. Pass a Drizzle instance whose schema includes
 * the tables from `src/drizzle/<dialect>.ts`, copied into the app or
 * imported as `dimahS3Tables` from `@dimah-s3/db/drizzle/<dialect>`:
 * `DimahS3DB.client(drizzleAdapter({ db, provider: "postgresql" }))`.
 */
export { drizzleAdapter, type DrizzleConfig } from "fumadb/adapters/drizzle";
