import { dimahS3 } from "@dimah-s3/server";
import { db } from "@dimah-s3/db";
import { dimahS3Db } from "@/lib/dimah-s3-db";
import { defaultBucket, s3Client } from "@/lib/s3-client";

/**
 * Same as `templates/nextjs` / `examples/with-nextjs`, plus the `db()` plugin.
 * Replace `resolveScope` with your session lookup (return `null` to reject).
 */
export const s3 = dimahS3({
  s3: s3Client,
  defaultBucket,
  upload: { enabled: true },
  download: { enabled: false },
  delete: { enabled: false },
  multipart: { enabled: false },
  plugins: [
    db({
      client: dimahS3Db,
      resolveScope: () => "user:demo",
    }),
  ],
});
