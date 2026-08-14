import type { MetadataRoute } from "next";
import { source } from "@/lib/source";
import { getSiteUrl } from "@/lib/site-url";

/** `/sitemap.xml` — homepage plus every docs page, for search crawlers. */
export default function sitemap(): MetadataRoute.Sitemap {
  const origin = getSiteUrl().origin;

  return [
    {
      url: origin,
      changeFrequency: "weekly",
      priority: 1,
    },
    ...source.getPages().map((page) => ({
      url: `${origin}${page.url}`,
      changeFrequency: "weekly" as const,
      priority: docsPriority(page.url),
    })),
  ];
}

function docsPriority(url: string): number {
  switch (url) {
    case "/docs":
      return 0.9;
    case "/docs/quickstart":
    case "/docs/comparison":
      return 0.8;
    default:
      return 0.7;
  }
}
