import {
  defineCollections,
  defineConfig,
  defineDocs,
} from "fumadocs-mdx/config";
import { remarkSteps } from "fumadocs-core/mdx-plugins/remark-steps";
import { metaSchema, pageSchema } from "fumadocs-core/source/schema";
import { z } from "zod";

// You can customise Zod schemas for frontmatter and `meta.json` here
// see https://fumadocs.dev/docs/mdx/collections
const blogDate = z.union([z.iso.date(), z.date()]).transform((value) => {
  if (typeof value === "string") return value;

  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
});

/**
 * Flat MDX posts. `avatar` is a file in `public/`
 * (`public/dimah-avatar.png` → `/dimah-avatar.png`).
 * `url` is the profile the name links to.
 */
const blogAuthor = z.object({
  name: z.string().trim().min(1),
  url: z.url().optional(),
  avatar: z
    .string()
    .trim()
    .regex(/^\/(?!\/)/)
    .optional(),
});

export const blogPosts = defineCollections({
  type: "doc",
  dir: "content/blog",
  schema: pageSchema.extend({
    author: blogAuthor,
    date: blogDate,
  }),
});

export const docs = defineDocs({
  dir: "content/docs",
  docs: {
    schema: pageSchema,
    postprocess: {
      includeProcessedMarkdown: true,
    },
  },
  meta: {
    schema: metaSchema,
  },
});

export default defineConfig({
  mdxOptions: {
    remarkPlugins: [remarkSteps],
  },
});
