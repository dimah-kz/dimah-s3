/**
 * Cleans up uploads that were never confirmed, and removes soft-deleted
 * rows and dead share links older than 30 days. Run it on a schedule. See
 * /docs/db/purge.
 *
 *   pnpm db:purge
 */
import { getS3 } from "../src/lib/s3";

const s3 = getS3();
const olderThan = Date.now() - 30 * 24 * 60 * 60 * 1000;
const { purged } = await s3.db.purgeStale();
const { pruned } = await s3.db.pruneDeleted({ olderThan });
const links = await s3.share.pruneLinks({ olderThan });

console.log(
  `Purged ${purged} stale upload(s), pruned ${pruned} row(s) and ${links.pruned} share link(s).`,
);
