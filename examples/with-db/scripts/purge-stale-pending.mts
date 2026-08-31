/**
 * Optional — delete stale `pending` rows and their S3 objects.
 * See /docs/db/purge
 *
 *   pnpm db:purge-stale
 */
import { purgeStalePendingObjects } from "@dimah-s3/db";
import { dimahS3Db } from "../src/lib/dimah-s3-db";
import { awsS3 } from "../src/lib/s3";

const { purged } = await purgeStalePendingObjects({
  client: dimahS3Db,
  olderThanMs: 24 * 60 * 60 * 1000,
  s3: awsS3,
});

console.log(`Purged ${purged.length} stale pending object(s).`);
