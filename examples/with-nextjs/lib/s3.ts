import { dimahS3 } from "@dimah-s3/server";
import { s3Client, defaultBucket } from "@/lib/s3-client";

export const s3 = dimahS3({
  s3: s3Client,
  defaultBucket,
  upload: { enabled: true },
  download: { enabled: true },
  delete: { enabled: true },
  multipart: { enabled: true },
});
