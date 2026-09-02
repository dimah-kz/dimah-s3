import { source } from "@/lib/source";
import { llms } from "fumadocs-core/source";
import { getSiteUrl } from "@/lib/site-url";
import {
  absolutizeMarkdownUrls,
  llmDecisionSheet,
  llmFileLists,
  llmMarkdownHeaders,
  toMarkdownTwinUrls,
} from "@/lib/llm-intro";

export const revalidate = false;

/** `/llms.txt` — decision sheet + docs index, for coding agents. */
export function GET() {
  const origin = getSiteUrl().origin;
  const { indexNode } = llms(source);
  const catalog = toMarkdownTwinUrls(
    absolutizeMarkdownUrls(
      source
        .getPageTree()
        .children.map((node) => indexNode(node))
        .join("\n"),
      origin,
    ),
    origin,
  );

  return new Response(
    `${llmDecisionSheet()}\n## Docs\n\n${catalog}\n\n${llmFileLists(origin)}`,
    { headers: llmMarkdownHeaders },
  );
}
