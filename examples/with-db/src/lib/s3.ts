import { dimahS3 } from "@dimah-s3/server";
import { db } from "@dimah-s3/db";
import { dimahS3Db } from "@/lib/dimah-s3-db";
import { defaultBucket, s3Client } from "@/lib/s3-client";

/**
 * Same as quickstart `dimahS3(...)`, plus the `db()` plugin from
 * https://dimah-s3.vercel.app/docs/db/setup
 *
 * Replace `resolveScope` with your session lookup (return `null` to reject).
 */
export const s3 = dimahS3({
  s3: s3Client,
  defaultBucket,
  upload: { enabled: true },
  multipart: { enabled: true },
  download: { enabled: true },
  delete: { enabled: true },
  plugins: [
    db({
      client: dimahS3Db,
      resolveScope: () => "user:demo",
    }),
  ],
});
