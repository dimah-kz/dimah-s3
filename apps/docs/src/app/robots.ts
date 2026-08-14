import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site-url";

/** `/robots.txt` — allow crawlers and point them at the sitemap. */
export default function robots(): MetadataRoute.Robots {
  const origin = getSiteUrl().origin;

  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
