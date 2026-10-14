import { cacheLife } from "next/cache";
import { notFound } from "next/navigation";
import { getBlogIndexLLMText, getBlogLLMText } from "@/lib/blog-content";
import { markdownPageHeaders } from "@/lib/llm-intro";
import { blogSource } from "@/lib/source";
import { blogRoute } from "@/lib/shared";

export async function GET(
  _req: Request,
  { params }: RouteContext<"/llms.mdx/blog/[[...slug]]">,
) {
  const { slug } = await params;
  const page = await pageMarkdown(slug);
  if (page == null) notFound();

  return new Response(page.text, {
    headers: markdownPageHeaders(page.htmlPath),
  });
}

async function pageMarkdown(slug: string[] | undefined) {
  "use cache";
  cacheLife("max");

  if (!slug?.length) {
    return { htmlPath: blogRoute, text: getBlogIndexLLMText() };
  }

  const page = blogSource.getPage(slug);
  if (!page) return null;

  return {
    htmlPath: page.url,
    text: await getBlogLLMText(page),
  };
}

export function generateStaticParams() {
  const params = blogSource.generateParams();
  const hasIndex = params.some((entry) => !entry.slug?.length);

  return hasIndex ? params : [{ slug: [] }, ...params];
}
