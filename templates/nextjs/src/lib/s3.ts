import { S3Client } from "@aws-sdk/client-s3";
import { dimahS3 } from "@dimah-s3/server";

export const s3 = dimahS3({
  client: new S3Client({
    region: process.env.S3_REGION,
    endpoint: process.env.S3_ENDPOINT,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID!,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
    },
  }),
  bucket: process.env.S3_BUCKET!,
  upload: { prefix: "uploads" },
});
