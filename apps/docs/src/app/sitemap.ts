import type { MetadataRoute } from "next";
import { getPosts, getTags } from "@/lib/blog";
import { getBlogPages } from "@/lib/blog-content";
import { blogAuthors, blogSource, source } from "@/lib/source";
import { blogRoute } from "@/lib/shared";
import { canonicalUrl } from "@/lib/site-url";

/** `/sitemap.xml` — 1 home · 0.9 intro/quickstart · 0.8 decision pages · 0.6 blog · then by depth. */
export default function sitemap(): MetadataRoute.Sitemap {
  const tags = getTags(getPosts(blogSource.getPages(), blogAuthors));

  return [
    entry(canonicalUrl("/"), 1),
    entry(canonicalUrl(blogRoute), 0.6),
    entry(canonicalUrl(`${blogRoute}/tags`), 0.4),
    ...tags.map((tag) => entry(canonicalUrl(tag.url), 0.4)),
    ...getBlogPages().map((page) => entry(canonicalUrl(page.url), 0.5)),
    ...source
      .getPages()
      .map((page) => entry(canonicalUrl(page.url), docsPriority(page.url))),
  ].sort(byImportance);
}

function entry(url: string, priority: number): MetadataRoute.Sitemap[number] {
  return {
    url,
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
