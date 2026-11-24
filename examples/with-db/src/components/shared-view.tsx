"use client";

import { useShareVisit } from "@dimah-s3/share/react";
import { SharedView as ShareLinkPage } from "@dimah-s3/ui/share";
import { s3Client } from "@/lib/s3-client";

/**
 * The page a share link opens, from `@dimah-s3/ui/share`: the password form
 * when the link has one, then the shared file, or the shared folder in a
 * read-only `ObjectList`.
 */
export function SharedView({ token }: { token: string }) {
  const visit = useShareVisit(s3Client.share, token);
  return <ShareLinkPage visit={visit} />;
}
