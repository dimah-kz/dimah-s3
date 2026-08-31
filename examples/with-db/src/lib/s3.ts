import { S3Client } from "@aws-sdk/client-s3";
import { dimahS3, route } from "@dimah-s3/server";
import { db } from "@dimah-s3/db";
import { dimahS3Db } from "@/lib/dimah-s3-db";

/**
 * Same as `templates/nextjs` / `examples/with-nextjs`, plus the `db()` plugin.
 * Replace `resolveScope` with your session lookup (return `null` to reject).
 */
export const awsS3 = new S3Client({
  region: process.env.S3_REGION,
  endpoint: process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  },
});

export const s3 = dimahS3({
  client: awsS3,
  bucket: process.env.S3_BUCKET!,
  plugins: [
    db({
      client: dimahS3Db,
      resolveScope: () => "user:demo",
    }),
  ],
  routes: {
    uploads: route({
      upload: {
        fileTypes: ["image/*", "application/pdf"],
        maxFileSize: 10 * 1024 * 1024,
      },
      download: true,
      delete: true,
    }),
  },
});
