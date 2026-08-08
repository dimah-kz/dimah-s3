"use client";

import { createS3Client } from "@dimah-s3/react";

export const { api, S3Provider, useApi } = createS3Client();

export function S3ClientProvider({ children }: { children: React.ReactNode }) {
  return <S3Provider>{children}</S3Provider>;
}
