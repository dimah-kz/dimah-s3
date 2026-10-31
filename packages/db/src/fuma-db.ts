import { fumadb, type InferFumaDB } from "fumadb";
import { v1 } from "./schema/v1";
import { v2 } from "./schema/v2";

/**
 * The @dimah-s3/db FumaDB library. Call `DimahS3DB.client(adapter)` with an
 * adapter from `@dimah-s3/db/adapters/*` to get a {@link DimahS3DbClient}.
 */
export const DimahS3DB = fumadb({
  namespace: "dimah_s3",
  schemas: [v1, v2],
});

/** FumaDB client for the @dimah-s3/db schemas. */
export type DimahS3DbClient = InferFumaDB<typeof DimahS3DB>;

/** The schema version the stores read and write. */
export const DB_SCHEMA_VERSION = v2.version;

export { v2 };
