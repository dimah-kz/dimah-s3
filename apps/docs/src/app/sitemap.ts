import type { MetadataRoute } from "next";
import { getBlogPosts } from "@/lib/blog";
import { source } from "@/lib/source";
import { blogRoute } from "@/lib/shared";
import { getSiteUrl } from "@/lib/site-url";

/** Captured when the module loads during `next build`, not on each request. */
const builtAt = new Date();

/** `/sitemap.xml` — 1 home · 0.9 intro/quickstart · 0.8 decision pages · 0.6 blog · then by depth. */
export default function sitemap(): MetadataRoute.Sitemap {
  const origin = getSiteUrl().origin;
  const posts = getBlogPosts();
  const newest = posts[0]?.data.date;

  return [
    entry(origin, 1),
    entry(
      `${origin}${blogRoute}`,
      0.6,
      newest ? new Date(`${newest}T00:00:00Z`) : builtAt,
    ),
    ...posts.map((page) =>
      entry(
        `${origin}${page.url}`,
        0.5,
        new Date(`${page.data.date}T00:00:00Z`),
      ),
    ),
    ...source
      .getPages()
      .map((page) => entry(`${origin}${page.url}`, docsPriority(page.url))),
  ].sort(byImportance);
}

function entry(
  url: string,
  priority: number,
  lastModified = builtAt,
): MetadataRoute.Sitemap[number] {
  return {
    url,
    lastModified,
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
