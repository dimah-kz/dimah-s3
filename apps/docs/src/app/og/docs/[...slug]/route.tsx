import { cacheLife } from "next/cache";
import { notFound } from "next/navigation";
import { findPath } from "fumadocs-core/page-tree";
import type * as PageTree from "fumadocs-core/page-tree";
import type { InferPageType } from "fumadocs-core/source";
import { HeroCard } from "@/components/og/hero-card";
import { IconTile, lucideIcon } from "@/components/og/icon-tile";
import { OgCard, ogSize } from "@/components/og/og-card";
import { renderImage } from "@/components/og/render-image";
import { getPageImage, source } from "@/lib/source";

export async function GET(
  _req: Request,
  { params }: RouteContext<"/og/docs/[...slug]">,
) {
  const { slug } = await params;
  const image = await renderDocsImage(slug);
  if (!image) notFound();

  return new Response(image, { headers: { "Content-Type": "image/png" } });
}

// Cached, so the build prerenders every page's card.
async function renderDocsImage(slug: string[]) {
  "use cache";
  cacheLife("max");

  const page = source.getPage(slug.slice(0, -1));
  if (!page) return null;

  // The docs index shares the landing hero, under its own eyebrow.
  if (page.slugs.length === 0) {
    return renderImage(
      <HeroCard eyebrow="Documentation" path={page.url} />,
      ogSize,
    );
  }

  const lang = page.data.lang ?? "en";
  const path = sidebarPath(page);

  return renderImage(
    <OgCard
      art={<IconTile icon={lucideIcon(page.data.icon ?? iconName(path))} />}
      description={plain(page.data.description)}
      eyebrow={lang === "fa" ? "مستندات" : eyebrow(path, page.data.title)}
      lang={lang}
      path={page.url}
      title={page.data.title}
    />,
    ogSize,
  );
}

export function generateStaticParams() {
  return source.getPages().map((page) => ({
    slug: getPageImage(page).segments,
  }));
}

/**
 * Sidebar nodes from the top down to the page. A translation left out of
 * the sidebar takes its English original's place.
 */
function sidebarPath(page: InferPageType<typeof source>): PageTree.Node[] {
  const tree = source.getPageTree();

  for (const url of [page.url, page.data.translations?.en]) {
    if (!url) continue;
    const path = findPath(
      tree.children,
      (node) =>
        (node.type === "page" && node.url === url) ||
        (node.type === "folder" && node.index?.url === url),
    );
    if (path) return path;
  }

  return [];
}

/**
 * The sidebar folders above the page, like "Server / Hooks". A folder named
 * like the page, its own index, is left out.
 */
function eyebrow(path: PageTree.Node[], title: string) {
  const names = path.flatMap((node) =>
    node.type === "folder" &&
    typeof node.name === "string" &&
    node.name !== title
      ? [node.name]
      : [],
  );

  return names.join(" / ") || "Documentation";
}

/** Icon name of the nearest node on the path that has one. */
function iconName(path: PageTree.Node[]) {
  for (const node of path.toReversed()) {
    const icon =
      node.type === "page"
        ? source.getNodePage(node)?.data.icon
        : node.type === "folder"
          ? source.getNodeMeta(node)?.data.icon
          : undefined;
    if (icon) return icon;
  }
}

/** Frontmatter descriptions use backticks for code; cards have no code font. */
function plain(text?: string) {
  return text?.replaceAll("`", "").trim() || undefined;
}
