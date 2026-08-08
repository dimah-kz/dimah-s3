# docs

This is a Next.js application generated with
[Create Fumadocs](https://github.com/fuma-nama/fumadocs).

## Deploy on Vercel

1. **Root Directory:** `apps/docs` (enable _Include source files outside of the Root Directory_).
2. **Node.js:** `24.x` in Vercel (matches `engines.node` `>=24` and CI).
3. **Environment variables:** none required for the default `*.vercel.app` URL (see [`.env.example`](./.env.example)). Set `NEXT_PUBLIC_SITE_URL` only when you add a custom domain.
4. `vercel.json` pins install/build for the monorepo (`turbo run build --filter=docs` from the repo root) and skips unaffected commits via `ignoreCommand` (`npx turbo-ignore`).

Run development server:

```bash
npm run dev
# or
pnpm dev
# or
yarn dev
```

Open http://localhost:3000 with your browser to see the result.

## Explore

In the project, you can see:

- `lib/source.ts`: Code for content source adapter, [`loader()`](https://fumadocs.dev/docs/headless/source-api) provides the interface to access your content.
- `lib/layout.shared.tsx`: Shared options for layouts, optional but preferred to keep.

| Route                     | Description                                            |
| ------------------------- | ------------------------------------------------------ |
| `app/(home)`              | The route group for your landing page and other pages. |
| `app/docs`                | The documentation layout and pages.                    |
| `app/api/search/route.ts` | The Route Handler for search.                          |

### Fumadocs MDX

A `source.config.ts` config file has been included, you can customise different options like frontmatter schema.

Read the [Introduction](https://fumadocs.dev/docs/mdx) for further details.

## Learn More

To learn more about Next.js and Fumadocs, take a look at the following
resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js
  features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.
- [Fumadocs](https://fumadocs.dev) - learn about Fumadocs
