import { cacheLife } from "next/cache";
import { notFound } from "next/navigation";
import { blog, getBlogIndexLLMText, getBlogLLMText } from "@/lib/blog";
import { llmMarkdownHeaders } from "@/lib/llm-intro";

export async function GET(
  _req: Request,
  { params }: RouteContext<"/llms.mdx/blog/[[...slug]]">,
) {
  const { slug } = await params;
  const text = await pageMarkdown(slug);
  if (text == null) notFound();

  return new Response(text, {
    headers: {
      ...llmMarkdownHeaders,
      Vary: "Accept",
    },
  });
}

async function pageMarkdown(slug: string[] | undefined) {
  "use cache";
  cacheLife("max");

  if (!slug?.length) return getBlogIndexLLMText();

  const page = blog.getPage(slug);
  if (!page) return null;
  return getBlogLLMText(page);
}

export function generateStaticParams() {
  const params = blog.generateParams();
  const hasIndex = params.some((entry) => !entry.slug?.length);

  return hasIndex ? params : [{ slug: [] }, ...params];
}
