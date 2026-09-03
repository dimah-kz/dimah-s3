# Brand studio

> Rule: `.cursor/rules/brand.mdc`.

Internal promo stills and videos for dimah-s3. Lives in **`apps/brand`** — a local Next app, **not** `apps/docs`. Do not add it to the docs sidebar, home header, sitemap, or the docs Vercel project.

Group **by product section**, then by kind (`stills` / `videos`). Paths on disk, URLs, and exported files stay in lockstep.

```
src/sections/{section}/{stills|videos}/{slug}.tsx
public/{section}/{stills|videos}/{slug}.{png|mp4}
/{section}/{stills|videos}/{slug}
```

The React canvas is the source of truth. Preview it live; screenshot `?export` locally. Do **not** put PNG / MP4 under `public/` unless a **published** surface (blog, OG, marketing page) will serve that exact file.

Sections today: `attachment`, `upload`, `download`, `delete`. Add a folder + `catalog.ts` entry when a new area needs promo.

## Placement

| What                               | Path                                                  |
| ---------------------------------- | ----------------------------------------------------- |
| Catalog + frames                   | `apps/brand/src/catalog.ts`, `registry.ts`            |
| Shared chrome                      | `apps/brand/src/lib/`                                 |
| Per-section canvases               | `apps/brand/src/sections/{section}/stills\|videos/`   |
| Preview routes                     | `apps/brand/src/app/` → `http://localhost:3100`       |
| Published PNG / JPG only           | `apps/brand/public/{section}/stills/`                 |
| Accidental `shadcn add @framecn/*` | `apps/brand/src/components/framecn/` (**gitignored**) |

Use this app's deps (`@dimah-s3/ui`, Tailwind, lucide). Do **not** add Editframe / framecn to `package.json` or the lockfile unless the human asks. Keep those deps out of `apps/docs`.

Routes are `noindex`. This app is local-only.

## Stills

1. Create `src/sections/{section}/stills/{slug}.tsx` — wrap in `BrandFrame` (`data-brand-frame`), English + LTR, light mode, real `@dimah-s3/ui`.
2. Register the item in `catalog.ts` and the component in `registry.ts`.
3. Preview: `pnpm --filter brand dev` → `/{section}/stills/{slug}`. Screenshot `?export` at the canvas size.
4. Leave the PNG out of git. Copy it into `public/{section}/stills/{slug}.png` **only** when a published surface needs it, then `git add -f` that file.

Default tweet still: **1200×675**. Example: `/attachment/stills/tweet`.

The studio Download link appears only when that file exists on disk.

## Videos ([framecn](https://framecn.dev/docs/installation))

`@framecn` is in `apps/brand/components.json`.

1. Compose under `src/sections/{section}/videos/`, not tracked `src/components/`.
2. If you must `pnpm --filter brand exec shadcn add @framecn/…`, move files into that videos folder and **revert** `package.json` / lockfile unless the human asked to keep Editframe.
3. Preview at `/{section}/videos/{slug}`. Render MP4 locally if needed — **never** commit it. Host published video on a CDN / R2 / S3, not `public/`.

## Git

Commit the studio (`apps/brand/src/`). Brand binaries under `public/{section}/stills|videos/` are gitignored. Do **not** commit `src/components/framecn/` or Editframe `package.json` / lockfile changes unless asked.
