"use client";

import { useEffect } from "react";
import { S3Provider } from "@dimah-s3/react";
import { demoS3Api } from "@/lib/demo-s3-api";
import { installDemoDownloadThrottle } from "@/lib/demo/install-demo-download-throttle";

/** Supplies the docs mock S3Api to live component previews. */
export function DemoS3Provider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    installDemoDownloadThrottle();
  }, []);

  return <S3Provider api={demoS3Api}>{children}</S3Provider>;
}
