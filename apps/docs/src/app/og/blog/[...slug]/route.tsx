import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { cacheLife } from "next/cache";
import { notFound } from "next/navigation";
import { Byline } from "@/components/og/byline";
import { IconTile, lucideIcon } from "@/components/og/icon-tile";
import { OgCard, ogSize } from "@/components/og/og-card";
import { renderImage } from "@/components/og/render-image";
import { getPosts, getTagPosts, getTags } from "@/lib/blog";
import {
  blogDescription,
  blogTagsDescription,
  getBlogPageImage,
  getBlogTagImage,
  tagDescription,
} from "@/lib/blog-content";
import { blogRoute } from "@/lib/shared";
import { blogAuthors, blogSource } from "@/lib/source";

export async function GET(
  _req: Request,
  { params }: RouteContext<"/og/blog/[...slug]">,
) {
  const { slug } = await params;
  const image = await renderBlogImage(slug);
  if (!image) notFound();

  return new Response(image, { headers: { "Content-Type": "image/png" } });
}

// Cached, so the build prerenders every card.
async function renderBlogImage(slug: string[]) {
  "use cache";
  cacheLife("max");

  const card = await blogCard(slug.slice(0, -1));
  return card ? renderImage(card, ogSize) : null;
}

export function generateStaticParams() {
  const tags = getTags(getPosts(blogSource.getPages()));

  return [
    { slug: ["image.png"] },
    { slug: getBlogTagImage().segments },
    ...tags.map((tag) => ({ slug: getBlogTagImage(tag.slug).segments })),
    ...blogSource.getPages().map((page) => ({
      slug: getBlogPageImage(page).segments,
    })),
  ];
}

/** The card for `/blog`, `/blog/tags`, a tag page, or a post. */
async function blogCard(segments: string[]) {
  const [first, second] = segments;

  if (segments.length === 0) {
    return (
      <OgCard
        art={<IconTile icon={lucideIcon("Newspaper")} />}
        description={blogDescription}
        path={blogRoute}
        title="Blog"
      />
    );
  }

  if (first === "tags" && segments.length <= 2) {
    const art = <IconTile icon={lucideIcon("Tags")} />;
    if (!second) {
      return (
        <OgCard
          art={art}
          description={blogTagsDescription}
          eyebrow="Blog"
          path={`${blogRoute}/tags`}
          title="Tags"
        />
      );
    }

    const result = getTagPosts(getPosts(blogSource.getPages()), second);
    if (!result) return null;

    return (
      <OgCard
        art={art}
        description={tagDescription(result.tag.name, result.posts.length)}
        eyebrow="Blog / Tags"
        path={result.tag.url}
        title={result.tag.name}
      />
    );
  }

  const page = blogSource.getPage(segments);
  if (!page) return null;

  const lang = page.data.lang ?? "en";
  const authorId = page.data.authors?.[0];
  const author = authorId
    ? (blogAuthors[authorId] ?? { name: authorId })
    : undefined;
  const date =
    page.data.date === undefined ? undefined : new Date(page.data.date);

  return (
    <OgCard
      description={page.data.description?.replaceAll("`", "").trim()}
      eyebrow={lang === "fa" ? "بلاگ" : "Blog"}
      lang={lang}
      meta={
        author ? (
          <Byline
            avatar={await avatar(author.image)}
            date={date}
            name={author.name}
          />
        ) : undefined
      }
      path={page.url}
      title={page.data.title}
    />
  );
}

const imageTypes: Record<string, string> = {
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

/** A `public/` image as a data URI. Takumi renders bytes, not site URLs. */
async function avatar(src?: string) {
  const type = src?.startsWith("/") && imageTypes[extname(src).toLowerCase()];
  if (!src || !type) return undefined;

  const bytes = await readFile(join(process.cwd(), "public", src));
  return `data:${type};base64,${bytes.toString("base64")}`;
}
