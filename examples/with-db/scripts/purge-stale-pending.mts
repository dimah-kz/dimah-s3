/**
 * Delete stale `pending` rows (presigned but never confirmed) and abort
 * their multipart uploads. Run on a schedule:
 *
 *   pnpm db:purge-stale
 */
import { AbortMultipartUploadCommand } from "@aws-sdk/client-s3";
import { purgeStalePendingObjects } from "@dimah-s3/db";
import { dimahS3Db } from "../src/lib/db";
import { s3Client } from "../src/lib/s3-client";

const { purged } = await purgeStalePendingObjects({
  db: dimahS3Db,
  olderThanMs: 24 * 60 * 60 * 1000,
  onBeforePurge: async (objects) => {
    for (const object of objects) {
      if (!object.uploadId) continue;
      await s3Client.send(
        new AbortMultipartUploadCommand({
          Bucket: object.bucket,
          Key: object.key,
          UploadId: object.uploadId,
        }),
      );
      console.log(`Aborted multipart upload for ${object.key}`);
    }
  },
});

console.log(`Purged ${purged.length} stale pending object(s).`);
