import { S3Client } from "@aws-sdk/client-s3";

/**
 * S3-compatible client configuration.
 * See: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/
 */
export const s3Client = new S3Client({
  region: process.env.S3_REGION,
  endpoint: process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  },
});

/** Default bucket name from environment */
export const defaultBucket = process.env.S3_DEFAULT_BUCKET!;
