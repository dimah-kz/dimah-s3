import {
  defineCollections,
  defineConfig,
  defineDocs,
} from "fumadocs-mdx/config";
import { remarkSteps } from "fumadocs-core/mdx-plugins/remark-steps";
import { metaSchema, pageSchema } from "fumadocs-core/source/schema";
import { blogPageSchema } from "./src/lib/blog";

// https://fumadocs.dev/docs/integrations/blog
export const blogPosts = defineCollections({
  type: "doc",
  dir: "content/blog",
  schema: blogPageSchema,
  postprocess: {
    includeProcessedMarkdown: true,
  },
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
