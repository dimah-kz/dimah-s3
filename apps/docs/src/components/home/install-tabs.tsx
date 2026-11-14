import { cn } from "cn";
import {
  CodeBlockTab,
  CodeBlockTabs,
  CodeBlockTabsList,
  CodeBlockTabsTrigger,
} from "fumadocs-ui/components/codeblock";
import { CachedCode } from "@/components/home/cached-code";

const target = "@dimah-s3/cli@beta create";

/** The same commands the docs generate from an `npm` code block. */
const managers = [
  { name: "npm", command: `npx ${target}` },
  { name: "pnpm", command: `pnpm dlx ${target}` },
  { name: "yarn", command: `yarn dlx ${target}` },
  { name: "bun", command: `bun x ${target}` },
];

/** The create command with a tab per package manager, as in the docs. */
export function InstallTabs({ className }: { className?: string }) {
  return (
    <CodeBlockTabs
      defaultValue={managers[0].name}
      className={cn("my-0 overflow-hidden", className)}
    >
      <CodeBlockTabsList className="border-b border-fd-border">
        {managers.map((manager) => (
          <CodeBlockTabsTrigger key={manager.name} value={manager.name}>
            {manager.name}
          </CodeBlockTabsTrigger>
        ))}
      </CodeBlockTabsList>
      {managers.map((manager) => (
        <CodeBlockTab key={manager.name} value={manager.name}>
          <CachedCode code={manager.command} lang="bash" />
        </CodeBlockTab>
      ))}
    </CodeBlockTabs>
  );
}
