"use client";

import { dbClient } from "@dimah-s3/db/client";
import { createS3Client } from "@dimah-s3/react";
import { shareClient } from "@dimah-s3/share/client";

/**
 * Browser client. `dbClient()` adds `api.db` for the listing and folders,
 * and `shareClient()` adds `api.share` for share links.
 */
export const s3Client = createS3Client({
  plugins: [dbClient(), shareClient()],
});

/** Next.js App Router: named Client Component export (not `<s3Client.Provider>`). */
export const S3Provider = s3Client.Provider;
