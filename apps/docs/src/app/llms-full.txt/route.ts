import { getLLMText, orderPagesForLlms, source } from "@/lib/source";
import { llmDecisionSheet, llmMarkdownHeaders } from "@/lib/llm-intro";

export const revalidate = false;

/** `/llms-full.txt` — decision sheet + every docs page as markdown. */
export async function GET() {
  const scan = orderPagesForLlms(source.getPages()).map(getLLMText);
  const scanned = await Promise.all(scan);

  return new Response(`${llmDecisionSheet()}\n\n${scanned.join("\n\n")}`, {
    headers: llmMarkdownHeaders,
  });
}
