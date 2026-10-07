import { cacheLife } from "next/cache";
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

/** `/llms.txt` — decision sheet + docs index, for coding agents. */
export async function GET() {
  return new Response(await llmsIndex(), { headers: llmMarkdownHeaders });
}

async function llmsIndex() {
  "use cache";
  cacheLife("max");

  const origin = getSiteUrl().origin;
  const { indexNode } = llms(source);
  const catalog = toMarkdownTwinUrls(
    absolutizeMarkdownUrls(
      source
        .getPageTree()
        .children.map((node) => {
          const line = indexNode(node);
          return typeof line === "string" ? line : "";
        })
        .join("\n"),
      origin,
    ),
    origin,
  );

  return `${llmDecisionSheet()}\n## Docs\n\n${catalog}\n\n${llmFileLists(origin)}`;
}
