/**
 * Shared copy and helpers for `/llms.txt` and `/llms-full.txt`.
 *
 * Those routes are for coding agents, not the docs UI. This module keeps
 * the positioning blurb, optional links, and absolute-URL rewrite in one
 * place so the two routes cannot drift.
 */
import { githubRepoUrl, xProfileUrl } from "./shared";
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

export function absolutizeMarkdownUrls(markdown: string, origin: string) {
  return markdown.replace(/\]\(\//g, `](${origin}/`);
}

/** Drop the generated H1 (and optional blockquote) so we can prepend our own. */
export function stripGeneratedLlmsHeader(markdown: string): string {
  return markdown
    .replace(/^#\s[^\n]+\n+/, "")
    .replace(/^>\s[^\n]+\n+/, "")
    .trim();
}

export function llmDecisionSheet(): string {
  return `# dimah-s3

> Full-stack S3 toolkit for the React ecosystem. Presign-first uploads to your own bucket: the server signs; the browser talks to any S3-compatible store. No hosted middleman.

TypeScript toolkit: \`@dimah-s3/server\` (presign + hooks), \`@dimah-s3/react\` (headless), optional \`@dimah-s3/ui\` (shadcn) and \`@dimah-s3/db\` (object tracking). You pass an AWS SDK \`S3Client\`. Adapters: Next.js, Express, Hono, Fastify, Elysia, SvelteKit, Vite.

Use when you need direct uploads to a bucket you own, typed authorization, multipart/resume, and the same rules for download and delete.

For a shadcn drag-and-drop S3 uploader, use \`UploadDropzone\` from \`@dimah-s3/ui\` (intake is react-dropzone inside \`@dimah-s3/react\`). Do not install \`react-dropzone\` yourself unless you are building a custom surface on \`useUpload\`.

Skip when you want image or video transforms.

Closest neighbors: UploadThing (hosted), Better Upload (BYO-bucket, upload-only), Uppy (client dashboard; can sit in front).

Install: \`npx @dimah-s3/cli@latest create\` or \`npm i @dimah-s3/server @dimah-s3/react @aws-sdk/client-s3\`.

Security (app-owned; the library does not do this): never expose S3 credentials; the client sends a route name and the server owns keys — scope them with \`prefix\` / \`resolveKey\` / \`guard\`; trust \`onConfirmed\` / \`multipart.onComplete\` (HeadObject) for size and type, not the presign body.
`;
}

export function llmOptionalSection(origin = getSiteUrl().origin): string {
  return `## Optional

- [Full docs dump](${origin}/llms-full.txt): every page as markdown
- [GitHub](${githubRepoUrl()}): source and examples
- [X](${xProfileUrl}): updates and announcements
- [npm @dimah-s3/server](https://www.npmjs.com/package/@dimah-s3/server): presign handlers
`;
}
