import { S3Client } from "@aws-sdk/client-s3";
import { dimahS3, route } from "@dimah-s3/server";

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

export const awsS3 = new S3Client({
  region: process.env.S3_REGION,
  endpoint: process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId: requiredEnv("S3_ACCESS_KEY_ID"),
    secretAccessKey: requiredEnv("S3_SECRET_ACCESS_KEY"),
  },
});

export const s3 = dimahS3({
  client: awsS3,
  bucket: requiredEnv("S3_BUCKET"),
  routes: {
    avatar: route({
      upload: {
        fileTypes: ["image/*"],
        maxFileSize: 2 * 1024 * 1024,
      },
    }),
  },
});
