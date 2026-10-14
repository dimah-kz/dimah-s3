import type { InferPageType } from "fumadocs-core/source";
import { getPosts } from "@/lib/blog";
import { absolutizeMarkdownUrls } from "@/lib/llm-intro";
import { blogAuthors, blogSource } from "@/lib/source";
import { blogImageRoute, blogRoute } from "@/lib/shared";
import { getSiteUrl } from "@/lib/site-url";

export const blogDescription =
  "Notes on direct uploads to an S3 bucket you own.";

export type BlogPage = InferPageType<typeof blogSource>;

/** Newest first, in the order `getPosts()` uses. */
export function getBlogPages() {
  const order = new Map(
    getPosts(blogSource.getPages(), blogAuthors).map((post, index) => [
      post.url,
      index,
    ]),
  );

  return blogSource.getPages().sort((a, b) => {
    return (order.get(a.url) ?? 0) - (order.get(b.url) ?? 0);
  });
}

export function blogNoteLines(origin: string) {
  return getBlogPages().map((post) => {
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

export function getBlogPageImage(page: { slugs: string[] }) {
  const segments = [...page.slugs, "image.png"];

  return {
    segments,
    url: `${blogImageRoute}/${segments.join("/")}`,
  };
}
