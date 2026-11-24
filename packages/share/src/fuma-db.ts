import { fumadb, type InferFumaDB } from "fumadb";
import { shareSchema } from "./schema/schema";

/**
 * The @dimah-s3/share FumaDB library. Call `DimahS3Share.client(adapter)`
 * with the same adapter you give `DimahS3Db.client`, from
 * `@dimah-s3/db/adapters/*`, to get a {@link DimahS3ShareClient}.
 */
export const DimahS3Share = fumadb({
  namespace: "dimah_s3_share",
  schemas: [shareSchema],
});

/** FumaDB client for the @dimah-s3/share schema. */
export type DimahS3ShareClient = InferFumaDB<typeof DimahS3Share>;

/** The schema version the store reads and writes. */
export const SHARE_SCHEMA_VERSION = shareSchema.version;
