import type { MetadataRoute } from "next";
import { source } from "@/lib/source";
import { getSiteUrl } from "@/lib/site-url";

const featuredDocs = ["/docs", "/docs/quickstart", "/docs/comparison"] as const;

/** `/sitemap.xml` — landing first, then intro, quickstart, comparison, then the rest. */
export default function sitemap(): MetadataRoute.Sitemap {
  const origin = getSiteUrl().origin;
  const pages = source.getPages();
  const featured = new Set<string>(featuredDocs);
  const rest = pages.filter((page) => !featured.has(page.url));

  return [
    entry(origin, 1),
    ...featuredDocs.map((url) => entry(`${origin}${url}`, docsPriority(url))),
    ...rest.map((page) =>
      entry(`${origin}${page.url}`, docsPriority(page.url)),
    ),
  ];
}

function entry(url: string, priority: number): MetadataRoute.Sitemap[number] {
  return {
    url,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority,
  };
}

function docsPriority(url: string): number {
  switch (url) {
    case "/docs":
    case "/docs/quickstart":
      return 0.9;
    case "/docs/comparison":
      return 0.8;
    default:
      return 0.7;
  }
}
