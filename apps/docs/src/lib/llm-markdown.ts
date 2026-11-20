import { readFileSync } from "node:fs";
import { join } from "node:path";
import { errorCodeTableMarkdown } from "@/components/error-code-table";

/**
 * Turns the MDX components that only render in the browser into Markdown,
 * so the `.md` twin of a page and `llms-full.txt` carry the same content:
 *
 * - `<DemoPreview name="x.tsx">` becomes the demo's source, as a code block.
 * - `<ErrorCodeTable raisedBy="…" />` becomes the error catalog table.
 *
 * `<Flow>` diagrams are dropped by the Markdown pass. Pages describe each
 * flow in prose or a table too.
 */
export function inlineMdxComponents(markdown: string): string {
  return markdown
    .replaceAll(
      /<DemoPreview\s+name="([^"]+)"[^>]*>[\s\S]*?<\/DemoPreview>/g,
      (_, name: string) => demoSource(name),
    )
    .replaceAll(
      /<ErrorCodeTable(?:\s+raisedBy="(server|client)")?\s*\/>/g,
      (_, raisedBy?: "server" | "client") => errorCodeTableMarkdown(raisedBy),
    );
}

const demosDir = join(process.cwd(), "src/components/demos");

function demoSource(name: string): string {
  const code = readFileSync(join(demosDir, name), "utf-8").trimEnd();
  return `\`\`\`tsx title="${name}"\n${code}\n\`\`\``;
}
