import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { OgCard } from "../src/components/og/og-card";
import { renderImage } from "../src/components/og/render-image";

/**
 * X Article cover, 5:2 at 2000×800. The card lays out at the share card's
 * 1200px width (1200×480) and renders at 5/3 the pixel density.
 */
const size = { width: 2000, height: 800 };
const devicePixelRatio = size.width / 1200;

// Run from `apps/docs`: the card's fonts load from `src/assets/og`.
const root = process.cwd();
const slug = process.argv[2] ?? "direct-uploads";

const source = await readFile(
  join(root, "content", "blog", `${slug}.mdx`),
  "utf8",
);
const title = frontmatter(source, "title");

if (!title) {
  throw new Error(`Missing title in content/blog/${slug}.mdx`);
}

if (size.width * 2 !== size.height * 5) {
  throw new Error("X article covers use a 5:2 frame");
}

// Takumi sizes the canvas in device pixels and lays out in CSS pixels.
const image = await renderImage(
  <OgCard eyebrow="Blog" path={`/blog/${slug}`} title={title} />,
  { ...size, devicePixelRatio },
);

const output = join(root, "content", "x", slug, "cover.png");
await writeFile(output, image);

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
