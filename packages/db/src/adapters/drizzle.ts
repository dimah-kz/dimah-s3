/**
 * The FumaDB Drizzle adapter. Pass a Drizzle instance whose schema includes
 * `dimahS3Tables` from `@dimah-s3/db/drizzle/<dialect>`:
 * `DimahS3DB.client(drizzleAdapter({ db, provider: "postgresql" }))`.
 */
export { drizzleAdapter, type DrizzleConfig } from "fumadb/adapters/drizzle";
