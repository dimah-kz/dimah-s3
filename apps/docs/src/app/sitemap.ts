import type { MetadataRoute } from "next";
import { source } from "@/lib/source";
import { getSiteUrl } from "@/lib/site-url";

/** `/sitemap.xml` — 1 home · 0.9 intro/quickstart · 0.8 comparison · then by depth. */
export default function sitemap(): MetadataRoute.Sitemap {
  const origin = getSiteUrl().origin;

  return [
    entry(origin, 1),
    ...source
      .getPages()
      .map((page) => entry(`${origin}${page.url}`, docsPriority(page.url))),
  ].sort(byImportance);
}

function entry(url: string, priority: number): MetadataRoute.Sitemap[number] {
  return {
    url,
    lastModified: new Date(),
    changeFrequency: priority >= 0.8 ? "weekly" : "monthly",
    priority,
  };
}

function docsPriority(url: string): number {
  if (url === "/docs" || url === "/docs/quickstart") return 0.9;
  if (url === "/docs/comparison") return 0.8;

  const depth = url.split("/").filter(Boolean).length;
  if (depth === 2) return 0.7;
  if (depth === 3) return 0.5;
  return 0.3;
}

function byImportance(
  a: MetadataRoute.Sitemap[number],
  b: MetadataRoute.Sitemap[number],
) {
  return (b.priority ?? 0) - (a.priority ?? 0) || a.url.localeCompare(b.url);
}
