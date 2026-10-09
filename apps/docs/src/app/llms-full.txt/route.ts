import { cacheLife } from "next/cache";
import { getBlogLLMText, getBlogPosts } from "@/lib/blog";
import { llmDecisionSheet, llmMarkdownHeaders } from "@/lib/llm-intro";
import { getLLMText, orderPagesForLlms, source } from "@/lib/source";

/** `/llms-full.txt` — decision sheet, every docs page, then every note. */
export async function GET() {
  return new Response(await llmsFull(), { headers: llmMarkdownHeaders });
}

async function llmsFull() {
  "use cache";
  cacheLife("max");

  const [scanned, notes] = await Promise.all([
    Promise.all(orderPagesForLlms(source.getPages()).map(getLLMText)),
    Promise.all(getBlogPosts().map(getBlogLLMText)),
  ]);

  return `${llmDecisionSheet()}\n\n${scanned.join("\n\n")}\n\n${notes.join("\n\n")}`;
}
