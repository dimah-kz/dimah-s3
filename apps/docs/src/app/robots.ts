import type { MetadataRoute } from "next";
import { getSiteUrl, isProductionDeploy } from "@/lib/site-url";

/** `/robots.txt` — allow crawlers on production; keep preview deploys out. */
export default function robots(): MetadataRoute.Robots {
  if (!isProductionDeploy()) {
    return {
      rules: {
        userAgent: "*",
        disallow: "/",
      },
    };
  }

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
