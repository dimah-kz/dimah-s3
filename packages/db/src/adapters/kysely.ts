/**
 * The FumaDB Kysely adapter. It can also migrate the schema:
 * `DimahS3DB.client(kyselyAdapter({ db, provider: "postgresql" }))`.
 */
export { kyselyAdapter } from "fumadb/adapters/kysely";
export type { KyselyConfig } from "fumadb";
