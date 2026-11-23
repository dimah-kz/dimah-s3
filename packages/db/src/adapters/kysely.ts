/**
 * The FumaDB Kysely adapter. `migrate(client)` creates the schema through it:
 * `DimahS3Db.client(kyselyAdapter({ db, provider: "postgresql" }))`.
 */
export { kyselyAdapter } from "fumadb/adapters/kysely";
export type { KyselyConfig } from "fumadb";
