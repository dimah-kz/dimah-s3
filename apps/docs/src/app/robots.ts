import type { MetadataRoute } from "next";
import { getSiteUrl, isPublicDocsDeploy } from "@/lib/site-url";

/** `/robots.txt` — allow crawlers on the public docs; keep other previews out. */
export default function robots(): MetadataRoute.Robots {
  if (!isPublicDocsDeploy()) {
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
