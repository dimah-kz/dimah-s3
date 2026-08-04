"use client";

import { S3Provider } from "@dimah-s3/react";
import { demoS3Api } from "@/lib/demo-s3-api";

/** Supplies the docs mock S3Api to live component previews. */
export function DemoS3Provider({ children }: { children: React.ReactNode }) {
  return <S3Provider api={demoS3Api}>{children}</S3Provider>;
}
