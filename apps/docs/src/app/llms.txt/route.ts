import { source } from "@/lib/source";
import { llms } from "fumadocs-core/source";
import { getSiteUrl } from "@/lib/site-url";
import {
  absolutizeMarkdownUrls,
  llmDecisionSheet,
  llmOptionalSection,
  stripGeneratedLlmsHeader,
} from "@/lib/llm-intro";

export const revalidate = false;

/** `/llms.txt` — decision sheet + docs index, for coding agents. */
export function GET() {
  const origin = getSiteUrl().origin;
  const catalog = stripGeneratedLlmsHeader(
    absolutizeMarkdownUrls(llms(source).index(), origin),
  );

  return new Response(
    `${llmDecisionSheet()}\n## Docs\n\n${catalog}\n\n${llmOptionalSection(origin)}`,
    {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
      },
    },
  );
}
