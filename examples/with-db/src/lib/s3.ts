import { S3Client } from "@aws-sdk/client-s3";
import { db } from "@dimah-s3/db";
import { dimahS3, route } from "@dimah-s3/server";
import { dimahS3Db } from "@/lib/db";

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

function createS3() {
  const awsS3 = new S3Client({
    region: process.env.S3_REGION,
    endpoint: process.env.S3_ENDPOINT,
    credentials: {
      accessKeyId: requiredEnv("S3_ACCESS_KEY_ID"),
      secretAccessKey: requiredEnv("S3_SECRET_ACCESS_KEY"),
    },
    // The SDK default (WHEN_SUPPORTED) breaks presigned uploads.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });

  /**
   * The Next.js starter setup plus the `db()` plugin. Every request belongs
   * to the `user:demo` scope: return your session's user from
   * `resolveScope` in a real app, or `null` to reject the request.
   */
  return dimahS3({
    client: awsS3,
    bucket: requiredEnv("S3_BUCKET"),
    // Signs upload tickets: at least 32 characters, the same on every instance.
    secret: requiredEnv("DIMAH_S3_SECRET"),
    plugins: [
      db({
        client: dimahS3Db,
        resolveScope: () => "user:demo",
        // Checked at upload and again at confirm. The list shows the meter.
        quota: { maxBytes: 100 * 1024 * 1024, maxFiles: 100 },
      }),
    ],
    routes: {
      files: route({
        upload: { maxFileSize: 20 * 1024 * 1024 },
        download: true,
        delete: true,
      }),
    },
  });
}

let instance: ReturnType<typeof createS3> | undefined;

/**
 * The dimah-s3 instance, created on first use so `next build` runs without
 * the S3 environment.
 */
export function getS3() {
  instance ??= createS3();
  return instance;
}
