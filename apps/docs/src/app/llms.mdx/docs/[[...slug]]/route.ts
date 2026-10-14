import { cacheLife } from "next/cache";
import { getLLMText, source } from "@/lib/source";
import { markdownPageHeaders } from "@/lib/llm-intro";
import { notFound } from "next/navigation";

export async function GET(
  _req: Request,
  { params }: RouteContext<"/llms.mdx/docs/[[...slug]]">,
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

  const page = source.getPage(slug);
  if (!page) return null;

  return {
    htmlPath: page.url,
    text: await getLLMText(page),
  };
}

export function generateStaticParams() {
  return source.generateParams();
}
