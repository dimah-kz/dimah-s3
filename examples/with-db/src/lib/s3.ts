import { S3Client } from "@aws-sdk/client-s3";
import { dimahS3 } from "@dimah-s3/server";
import { db } from "@dimah-s3/db";
import { dimahS3Db } from "@/lib/dimah-s3-db";

/**
 * Same as `templates/nextjs` / `examples/with-nextjs`, plus the `db()` plugin.
 * Replace `resolveScope` with your session lookup (return `null` to reject).
 */
export const s3Sdk = new S3Client({
  region: process.env.S3_REGION,
  endpoint: process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  },
});

export const s3 = dimahS3({
  client: s3Sdk,
  bucket: process.env.S3_BUCKET!,
  upload: { prefix: "uploads" },
  download: true,
  delete: true,
  plugins: [
    db({
      client: dimahS3Db,
      resolveScope: () => "user:demo",
    }),
  ],
});
