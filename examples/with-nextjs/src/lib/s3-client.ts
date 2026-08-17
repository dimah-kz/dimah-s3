"use client";

import type { ComponentProps } from "react";
import { createS3Client } from "@dimah-s3/react";

export const s3Client = createS3Client();

/** Top-level export so Next.js App Router can mount this from a Server Component. */
export function S3Provider(props: ComponentProps<typeof s3Client.Provider>) {
  return <s3Client.Provider {...props} />;
}
