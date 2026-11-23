import { OgCard } from "@/components/og/og-card";
import { UploadPanel } from "@/components/og/upload-panel";
import { packageVersion, siteTagline } from "@/lib/shared";

/** The landing hero's subtitle (`app/(home)/page.tsx`). */
const heroSubtitle =
  "Upload, download, and delete files in your own S3-compatible bucket.";

/**
 * The landing page's hero as a card: the tagline on two lines, from " for "
 * on in muted ink, the subtitle, and a still of the live upload demo. The
 * site's image, and the docs index's with an eyebrow.
 */
export function HeroCard({
  eyebrow,
  path,
}: {
  eyebrow?: string;
  path?: string;
}) {
  const at = siteTagline.indexOf(" for ");

  return (
    <OgCard
      art={<UploadPanel />}
      badge={`v${packageVersion}`}
      description={heroSubtitle}
      eyebrow={eyebrow}
      path={path}
      title={at === -1 ? siteTagline : siteTagline.slice(0, at)}
      titleTail={at === -1 ? undefined : siteTagline.slice(at + 1)}
    />
  );
}
