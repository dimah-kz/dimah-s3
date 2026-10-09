import { blogPosts } from "collections/server";
import { type InferPageType, loader } from "fumadocs-core/source";
import { toFumadocsSource } from "fumadocs-mdx/runtime/server";
import { absolutizeMarkdownUrls } from "./llm-intro";
import { appName, blogImageRoute, blogRoute } from "./shared";
import { getSiteUrl } from "./site-url";

export const blogDescription =
  "Notes on presigned uploads, object metadata, and when a database belongs in the stack.";

const blogDateFormat = new Intl.DateTimeFormat("en", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
  year: "numeric",
});

export const blog = loader({
  baseUrl: blogRoute,
  source: toFumadocsSource(blogPosts, []),
});

export type BlogPage = InferPageType<typeof blog>;

/** Newest first. Posts are flat files; order comes from frontmatter `date`. */
export function getBlogPosts() {
  return blog.getPages().sort((a, b) => {
    const byDate = b.data.date.localeCompare(a.data.date);
    if (byDate !== 0) return byDate;
    return a.url.localeCompare(b.url);
  });
}

export function formatBlogDate(isoDate: string) {
  return blogDateFormat.format(new Date(`${isoDate}T00:00:00Z`));
}

/** Newest first. Descriptions are the llms.txt blurbs. */
export function blogNoteLines(origin: string) {
  return getBlogPosts().map((post) => {
    const description = post.data.description
      ? `: ${post.data.description}`
      : "";

    return `- [${post.data.title}](${origin}${post.url}.md)${description}`;
  });
}

export function llmBlogSection(origin = getSiteUrl().origin) {
  return `## Notes\n\n${blogNoteLines(origin).join("\n")}\n`;
}

export function getBlogIndexLLMText() {
  const origin = getSiteUrl().origin;

  return `# Blog (${origin}${blogRoute})

${blogDescription}

${blogNoteLines(origin).join("\n")}
`;
}

export async function getBlogLLMText(page: BlogPage) {
  const processed = await page.data.getText("processed");
  const origin = getSiteUrl().origin;
  const absolute = absolutizeMarkdownUrls(processed, origin);

  return `# ${page.data.title} (${origin}${page.url})

${absolute}`;
}

export function getBlogNeighbors(url: string) {
  const posts = getBlogPosts();
  const index = posts.findIndex((post) => post.url === url);

  return {
    newer: index > 0 ? posts[index - 1] : undefined,
    older:
      index !== -1 && index < posts.length - 1 ? posts[index + 1] : undefined,
  };
}

export function getBlogPageImage(page: BlogPage) {
  const segments = [...page.slugs, "image.png"];

  return {
    segments,
    url: `${blogImageRoute}/${segments.join("/")}`,
  };
}

export type BlogAuthor = BlogPage["data"]["author"];

export function blogPostingJsonLd(input: {
  author: BlogAuthor;
  date: string;
  description: string;
  image: string;
  origin: string;
  title: string;
  url: string;
}) {
  const pageUrl = `${input.origin}${input.url}`;
  const avatar = input.author.avatar
    ? new URL(input.author.avatar, input.origin).href
    : undefined;

  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    author: {
      "@type": "Person",
      name: input.author.name,
      ...(input.author.url ? { url: input.author.url } : {}),
      ...(avatar ? { image: avatar } : {}),
    },
    datePublished: input.date,
    description: input.description,
    headline: input.title,
    image: `${input.origin}${input.image}`,
    mainEntityOfPage: pageUrl,
    publisher: {
      "@type": "Organization",
      name: appName,
      url: input.origin,
    },
    url: pageUrl,
  };
}
