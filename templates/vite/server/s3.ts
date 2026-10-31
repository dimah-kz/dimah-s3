import { S3Client } from "@aws-sdk/client-s3";
import { dimahS3, route } from "@dimah-s3/server";

export const awsS3 = new S3Client({
  region: process.env.S3_REGION,
  endpoint: process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  },
  // The SDK default (WHEN_SUPPORTED) breaks presigned uploads.
  requestChecksumCalculation: "WHEN_REQUIRED",
});

export const s3 = dimahS3({
  client: awsS3,
  bucket: process.env.S3_BUCKET!,
  // Signs upload tickets: at least 32 characters, the same on every instance.
  secret: process.env.DIMAH_S3_SECRET || undefined,
  routes: {
    avatar: route({
      upload: {
        fileTypes: ["image/*"],
        maxFileSize: 2 * 1024 * 1024,
      },
    }),
  },
});
