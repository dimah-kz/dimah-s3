import { cacheLife } from "next/cache";
import { ServerCodeBlock } from "fumadocs-ui/components/codeblock.rsc";

/** A highlighted code block for a tab. Highlighting runs once at build time. */
export async function CachedCode({
  code,
  lang,
}: {
  code: string;
  lang: string;
}) {
  "use cache";
  cacheLife("max");

  return (
    <ServerCodeBlock
      code={code}
      lang={lang}
      codeblock={{
        className: "border-0",
        viewportProps: { className: "max-h-none" },
      }}
    />
  );
}
