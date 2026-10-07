import { cacheLife } from "next/cache";
import { getLLMText, orderPagesForLlms, source } from "@/lib/source";
import { llmDecisionSheet, llmMarkdownHeaders } from "@/lib/llm-intro";

/** `/llms-full.txt` — decision sheet + every docs page as markdown. */
export async function GET() {
  return new Response(await llmsFull(), { headers: llmMarkdownHeaders });
}

async function llmsFull() {
  "use cache";
  cacheLife("max");

  const scan = orderPagesForLlms(source.getPages()).map(getLLMText);
  const scanned = await Promise.all(scan);
  return `${llmDecisionSheet()}\n\n${scanned.join("\n\n")}`;
}
