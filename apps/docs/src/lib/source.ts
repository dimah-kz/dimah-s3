import { docs } from "collections/server";
import { type InferPageType, loader } from "fumadocs-core/source";
import { lucideIconsPlugin } from "fumadocs-core/source/lucide-icons";
import { docsContentRoute, docsImageRoute, docsRoute } from "./shared";
import { getSiteUrl } from "./site-url";
import { absolutizeMarkdownUrls, LLM_PAGE_PRIORITY } from "./llm-intro";

// See https://fumadocs.dev/docs/headless/source-api for more info
export const source = loader({
  baseUrl: docsRoute,
  source: docs.toFumadocsSource(),
  plugins: [lucideIconsPlugin()],
});

export function getPageImage(page: InferPageType<typeof source>) {
  const segments = [...page.slugs, "image.png"];

  return {
    segments,
    url: `${docsImageRoute}/${segments.join("/")}`,
  };
}

export function getPageMarkdownUrl(page: InferPageType<typeof source>) {
  const segments = [...page.slugs, "content.md"];

  return {
    segments,
    url: `${docsContentRoute}/${segments.join("/")}`,
  };
}

export async function getLLMText(page: InferPageType<typeof source>) {
  const processed = await page.data.getText("processed");
  const origin = getSiteUrl().origin;
  const absolute = absolutizeMarkdownUrls(processed, origin);

  return `# ${page.data.title} (${origin}${page.url})

${absolute}`;
}

export function orderPagesForLlms<T extends { url: string }>(pages: T[]): T[] {
  const rank = new Map<string, number>(
    LLM_PAGE_PRIORITY.map((url, index) => [url, index]),
  );

  return [...pages].sort((a, b) => {
    const aRank = rank.get(a.url) ?? Number.MAX_SAFE_INTEGER;
    const bRank = rank.get(b.url) ?? Number.MAX_SAFE_INTEGER;
    if (aRank !== bRank) return aRank - bRank;
    return a.url.localeCompare(b.url);
  });
}
