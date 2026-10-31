/**
 * Drizzle schema for `drizzle-kit push` and `src/lib/db.ts`.
 *
 * The @dimah-s3/db tables ship prebuilt. Keep their `dimahS3Tables` keys:
 * the FumaDB Drizzle adapter finds the tables by them. Add your own tables
 * below.
 */
import { dimahS3Tables } from "@dimah-s3/db/drizzle/sqlite";

export const { storageObject, storageFolder, private_dimah_s3_settings } =
  dimahS3Tables;
