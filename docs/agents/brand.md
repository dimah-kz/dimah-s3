# Brand studio

Internal promo stills and videos. Lives in **`apps/brand`** — a local Next app, **not** `apps/docs`. Do not add it to the docs sidebar, home header, sitemap, or the docs Vercel project.

The React canvas is the source of truth. Preview it live; screenshot `?export` locally. Do **not** put PNG / MP4 under `public/` unless a **published** surface (blog, OG, marketing page) will serve that exact file.

Paths stay in lockstep:

```
src/sections/{section}/{stills|videos}/{slug}.tsx
public/{section}/{stills|videos}/{slug}.{png|mp4}
/{section}/{stills|videos}/{slug}
```

Register new work in `catalog.ts` and `registry.ts` like existing items. Preview: `pnpm --filter brand dev` → http://localhost:3100. Routes are `noindex`.

Use this app’s deps (`@dimah-s3/ui`, Tailwind, lucide). Do **not** add Editframe / framecn to `package.json` or the lockfile unless the human asks. Keep those deps out of `apps/docs`.

## Stills

1. Canvas under `src/sections/{section}/stills/` — wrap in `BrandFrame` (`data-brand-frame`), English + LTR, light mode, real `@dimah-s3/ui`.
2. Register in `catalog.ts` + `registry.ts`.
3. Preview `/{section}/stills/{slug}`. Screenshot `?export` at the canvas size.
4. Leave the PNG out of git. Copy into `public/` **only** when a published surface needs it, then `git add -f`.

Default tweet still: **1200×675**.

## Videos ([framecn](https://framecn.dev/docs/installation))

`@framecn` is in `apps/brand/components.json`. Compose under `src/sections/{section}/videos/`, not tracked `src/components/`.

If you must `shadcn add @framecn/…`, move files into that videos folder and **revert** `package.json` / lockfile unless asked to keep Editframe. Accidental CLI dumps in `src/components/framecn/` stay gitignored.

Never commit MP4. Host published video on a CDN / R2 / S3, not `public/`.

## Git

Commit the studio source (`apps/brand/src/`). Brand binaries under `public/` are gitignored. Do not commit `src/components/framecn/` or Editframe lockfile changes unless asked.
