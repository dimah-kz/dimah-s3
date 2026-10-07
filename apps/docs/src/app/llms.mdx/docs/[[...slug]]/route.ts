import { cacheLife } from "next/cache";
import { getLLMText, source } from "@/lib/source";
import { llmMarkdownHeaders } from "@/lib/llm-intro";
import { notFound } from "next/navigation";

export async function GET(
  _req: Request,
  { params }: RouteContext<"/llms.mdx/docs/[[...slug]]">,
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

  const page = source.getPage(slug);
  if (!page) return null;
  return getLLMText(page);
}

export function generateStaticParams() {
  return source.generateParams();
}
