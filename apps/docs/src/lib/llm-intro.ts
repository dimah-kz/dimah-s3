/**
 * Shared copy and helpers for `/llms.txt` and `/llms-full.txt`.
 *
 * Those routes are for coding agents, not the docs UI. This module keeps
 * the positioning blurb, file lists, and URL helpers in one place so the
 * two routes cannot drift. Structure follows https://llmstxt.org (v2):
 * H1, blockquote, preamble (no headings), then H2 file lists.
 */
import {
  docsRoute,
  githubRepoUrl,
  npmPackageUrls,
  xProfileUrl,
} from "./shared";
import { getSiteUrl } from "./site-url";

/** Pages that should appear first in llms-full.txt (then the rest by URL). */
export const LLM_PAGE_PRIORITY = [
  "/docs",
  "/docs/quickstart",
  "/docs/comparison",
  "/docs/providers",
  "/docs/providers/cloudflare-r2",
  "/docs/server",
  "/docs/server/security",
  "/docs/server/setup",
  "/docs/server/routes",
  "/docs/server/hooks/global-guard",
  "/docs/server/hooks/upload",
  "/docs/react",
  "/docs/db",
] as const;

export const llmMarkdownHeaders = {
  "Content-Type": "text/markdown; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
} as const;

export function absolutizeMarkdownUrls(markdown: string, origin: string) {
  return markdown.replace(/\]\(\//g, `](${origin}/`);
}

/**
 * Point docs catalog links at markdown twins (`/docs/page.md`), per llmstxt.org.
 * HTML `/docs` URLs still work for humans; agents should fetch `.md`.
 */
export function toMarkdownTwinUrls(markdown: string, origin: string) {
  const docsBase = `${origin}${docsRoute}`;

  return markdown.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (full, title: string, url: string) => {
      if (!url.startsWith(docsBase)) return full;
      if (/\.(md|mdx|txt)$/i.test(url)) return full;
      return `[${title}](${url}.md)`;
    },
  );
}

export function llmDecisionSheet(): string {
  return `# dimah-s3

> Presign-first S3 toolkit: the server signs, the browser talks to your bucket. Not a hosted uploader, and not an S3 SDK wrapper.

TypeScript packages: \`@dimah-s3/server\` (handlers and hooks), \`@dimah-s3/react\` (headless client), optional \`@dimah-s3/ui\` (shadcn) and \`@dimah-s3/db\` (object tracking). Protocol types live in \`@dimah-s3/core\`. You pass an AWS SDK \`S3Client\`.

HTTP adapters: Next.js, Express, Hono, Fastify, Elysia, SvelteKit, Node, and Fetch. CLI starters include Next.js, Vite + Hono, and Hono.

Use it for direct uploads to a bucket you own, typed authorization, multipart/resume, and the same route rules for download and delete. Skip it when you need image or video transforms. List, copy, tagging, and other S3 operations stay in your own AWS SDK code.

Neighbors: UploadThing (hosted), Better Upload (BYO-bucket, upload-only), Uppy (client dashboard; can sit in front).

Install: \`npx @dimah-s3/cli@latest create\` or \`npm i @dimah-s3/server @dimah-s3/react @aws-sdk/client-s3\`.

Constraints:

- Never expose S3 credentials. The client sends a route name; the server owns keys under that route's \`keyPrefix\` (default: the route name). Default key is \`{keyPrefix}/{uuid}/{name}\`. \`keyPrefix: false\` generates \`{uuid}/{name}\`. Nested or identical prefixes across routes are rejected at init.
- Prefer one feature per named route. Combine upload, download, and delete only when those callers share the key namespace.
- Scope per-user folders with \`upload.object\` / \`guard\`. Enforce ownership with \`db()\` or a download/delete \`guard\`.
- Trust \`onConfirmed\` (HeadObject, including multipart complete) for size and type, not the presign body. \`fileTypes\` is the S3 Content-Type header and filename, not a byte sniff.
- Without \`db()\`, download can presign unconfirmed keys under \`keyPrefix\`. Auth and quota stay in consumer hooks.
`;
}

export function llmFileLists(origin = getSiteUrl().origin): string {
  return `## Packages

- [@dimah-s3/server](${npmPackageUrls[0]}): presign handlers, hooks, and adapters
- [@dimah-s3/react](${npmPackageUrls[1]}): headless upload, download, and delete hooks
- [@dimah-s3/ui](${npmPackageUrls[2]}): optional shadcn components
- [@dimah-s3/core](${npmPackageUrls[3]}): protocol SSOT (\`S3_API_ROUTES\`, \`createS3Client\`)
- [@dimah-s3/db](${npmPackageUrls[4]}): optional object tracking plugin
- [@dimah-s3/cli](${npmPackageUrls[5]}): \`create\` scaffold

## Optional

- [Full docs dump](${origin}/llms-full.txt): every page as markdown
- [GitHub](${githubRepoUrl()}): source and examples
- [X](${xProfileUrl}): updates
`;
}
