import { S3Client } from "@aws-sdk/client-s3";
import { dimahS3, route } from "@dimah-s3/server";

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
  routes: {
    uploads: route({
      upload: {
        prefix: "uploads",
        fileTypes: ["image/*", "application/pdf"],
        maxFileSize: 10 * 1024 * 1024,
      },
      download: true,
      delete: true,
    }),
  },
});
