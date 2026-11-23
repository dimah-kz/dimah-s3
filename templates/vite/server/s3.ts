import { S3Client } from "@aws-sdk/client-s3";
import { dimahS3, route } from "@dimah-s3/server";

/** A required variable from `.env`. */
function env(name: string): string {
  const value = process.env[name];
  if (!value)
    throw new Error(`${name} is not set. Set it in .env or the environment.`);
  return value;
}

export const awsS3 = new S3Client({
  region: process.env.S3_REGION,
  endpoint: process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId: env("S3_ACCESS_KEY_ID"),
    secretAccessKey: env("S3_SECRET_ACCESS_KEY"),
  },
  // The SDK default (WHEN_SUPPORTED) breaks presigned uploads.
  requestChecksumCalculation: "WHEN_REQUIRED",
});

// Upload tickets are signed with DIMAH_S3_SECRET, which the server reads
// from the environment: at least 32 characters, the same on every instance.
export const s3 = dimahS3({
  client: awsS3,
  bucket: env("S3_BUCKET"),
  routes: {
    avatar: route({
      // This route is open: anyone who can reach the app can upload. Check
      // the caller here, and throw to refuse (`s3Error` is exported from
      // "@dimah-s3/server").
      // guard: async ({ request }) => {
      //   const session = await getSession(request);
      //   if (!session) throw s3Error("UNAUTHORIZED");
      // },
      upload: {
        fileTypes: ["image/*"],
        maxFileSize: 2 * 1024 * 1024,
      },
    }),
  },
});
