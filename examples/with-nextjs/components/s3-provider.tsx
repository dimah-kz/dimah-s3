"use client";

import { createS3Client } from "@dimah-s3/react";
import type { ReactNode } from "react";

export const { api, S3Provider, useApi } = createS3Client();

/**
 * Wraps the app with an S3Provider so all dimah-s3 hooks and UI components
 * can access the shared client.
 */
export function S3ClientProvider({ children }: { children: ReactNode }) {
  return <S3Provider>{children}</S3Provider>;
}
