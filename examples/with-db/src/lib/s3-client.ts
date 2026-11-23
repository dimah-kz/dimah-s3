"use client";

import { dbClient } from "@dimah-s3/db/client";
import { createS3Client } from "@dimah-s3/react";

/** Browser client. `dbClient()` adds `api.db` for the listing and folders. */
export const s3Client = createS3Client({
  plugins: [dbClient()],
});

/** Next.js App Router: named Client Component export (not `<s3Client.Provider>`). */
export const S3Provider = s3Client.Provider;
