<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# apps/brand

Local promo studio for dimah-s3 stills and framecn videos. Not the docs site — do not add it to docs nav, sitemap, or the docs Vercel project.

Canvases: `src/sections/{section}/stills|videos/`. Preview: `pnpm --filter brand dev` → http://localhost:3100. Read [brand.md](../../docs/agents/brand.md) before adding a still or video. Do not commit `src/components/framecn/` or Editframe `package.json` / lockfile changes unless asked.
