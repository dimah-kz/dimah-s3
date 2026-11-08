import { fumadb, type InferFumaDB } from "fumadb";
import { dbSchema } from "./schema/schema";

/**
 * The @dimah-s3/db FumaDB library. Call `DimahS3DB.client(adapter)` with an
 * adapter from `@dimah-s3/db/adapters/*` to get a {@link DimahS3DbClient}.
 */
export const DimahS3DB = fumadb({
  namespace: "dimah_s3",
  schemas: [dbSchema],
});

/** FumaDB client for the @dimah-s3/db schema. */
export type DimahS3DbClient = InferFumaDB<typeof DimahS3DB>;

/** The schema version the stores read and write. */
export const DB_SCHEMA_VERSION = dbSchema.version;
