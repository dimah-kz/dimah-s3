/**
 * Optional — delete stale `pending` rows and abort their multipart uploads.
 * See /docs/db/purge
 *
 *   pnpm db:purge-stale
 */
import { AbortMultipartUploadCommand } from "@aws-sdk/client-s3";
import { purgeStalePendingObjects } from "@dimah-s3/db";
import { dimahS3Db } from "../src/lib/dimah-s3-db";
import { awsS3 } from "../src/lib/s3";

const { purged } = await purgeStalePendingObjects({
  db: dimahS3Db,
  olderThanMs: 24 * 60 * 60 * 1000,
  onBeforePurge: async (objects) => {
    for (const object of objects) {
      if (!object.uploadId) continue;
      await awsS3.send(
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
