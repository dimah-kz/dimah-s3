import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DocsCard } from "../src/components/og/docs-card";
import { ogFonts } from "../src/lib/og-fonts";
import { appName } from "../src/lib/shared";
import { ImageResponse } from "next/og";

/** Open Graph card width. Type and spacing scale from this. */
const ogWidth = 1200;

/** X Article cover. Width:height stays 5:2. */
const width = 2000;
const height = 800;

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const slug = process.argv[2] ?? "direct-uploads";

const source = await readFile(
  join(root, "content", "blog", `${slug}.mdx`),
  "utf8",
);
const title = frontmatter(source, "title");

if (!title) {
  throw new Error(`Missing title in content/blog/${slug}.mdx`);
}

if (width * 2 !== height * 5) {
  throw new Error("X article covers use a 5:2 frame");
}

const fonts = await ogFonts();
const image = new ImageResponse(
  <DocsCard
    brand={appName}
    contentBottom={112}
    label="Blog"
    scale={width / ogWidth}
    title={title}
  />,
  { fonts, height, width },
);

const output = join(root, "content", "x", slug, "cover.png");
await writeFile(output, new Uint8Array(await image.arrayBuffer()));

function frontmatter(markdown: string, key: string) {
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown);
  const line = block?.[1]
    ?.split(/\r?\n/)
    .find((entry) => entry.startsWith(`${key}:`));

  return line
    ?.slice(key.length + 1)
    .trim()
    .replaceAll(/^["']|["']$/g, "");
}
