"use client";

import { createS3Client } from "@dimah-s3/react";

export const s3Client = createS3Client();

/** Next.js App Router: named Client Component export (not `<s3Client.Provider>`). */
export const S3Provider = s3Client.Provider;
