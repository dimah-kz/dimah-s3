# UI & shadcn registry

Source of truth: `packages/ui/src/`.

This is a [source registry](https://ui.shadcn.com/docs/registry/getting-started): root `registry.json` includes `packages/ui/registry.json`, whose `files[].path` values point at `packages/ui/src`. Do not copy or rewrite UI sources for install.

## Do not edit stock shadcn

`packages/ui/src/components/ui/*` are vendor primitives. Do not hand-edit them. Own product UI under `components/dimah-s3/`, `hooks/`, and `lib/`.

Refresh primitives with `pnpm --filter @dimah-s3/ui sync:shadcn` (overwrite). Compose on top — never fork a stock file.

## Changing a component

1. Edit only `components/dimah-s3/`, `hooks/`, or `lib/`.
2. Imports: short `@/` alias only. The shadcn CLI rewrites these on install.
3. If the item’s file list or shadcn primitive deps changed → update `packages/ui/scripts/registry-items.ts`.
4. `pnpm registry:validate` regenerates `packages/ui/registry.json` and checks completeness. Commit that file if it changed.
5. `pnpm registry:build` writes `apps/docs/public/r/` (docs `build` depends on this).

Do not hand-edit `packages/ui/registry.json` or `apps/docs/public/r/`.

User-visible copy: `@fuma-translate/react` (do not re-export). After string changes, `pnpm --filter @dimah-s3/react compile:translations`.

Wired controls take the matching hook return as `upload` / `download` / `delete`. They do not call the hook.

## Registry item rules

Match existing items in `registry-items.ts`. Landmines:

- List every file the installer needs in `files[]` (hooks included). `registry:check` fails if a local `@/` import is missing.
- `registryDependencies`: shadcn primitives only — not other `@dimah-s3` items.
- **No basename collision** with those primitives. `lib/attachment.ts` is rewritten onto the stock Attachment — layout helpers belong in `lib/attachment-layout.ts`.
- `dependencies`: every npm import the copied source uses. Import `cn` from `"cn"` and list `cn` here.
- `cssVars.theme`: `--color-dimah-s3-*` so registry-only apps get utilities without `@dimah-s3/ui`.
- `files[].target` uses shadcn placeholders (`@components/`, `@hooks/`, `@lib/`).

## Serve vs GitHub

- HTTP registry: `shadcn build` → `apps/docs/public/r/{name}.json` (`https://dimah-s3.vercel.app/r/{name}.json`). Prefer this over app routes.
- GitHub registry: root `registry.json` is the catalog. Keep `packages/ui/registry.json` committed so GitHub installs stay in sync.

## UI conventions

- Dimah-owned colors: `*-dimah-s3-*` utilities (`bg-dimah-s3-primary`, …) via `packages/ui/css/shadcn.css`. Do not use bare `bg-primary` in `components/dimah-s3/` — those classes are for stock `components/ui/` only.
- Direction-safe CSS (LTR default, RTL-ready): logical utilities (`text-start` / `text-end`, `ms-*` / `me-*`, `ps-*` / `pe-*`, `start-*` / `end-*`) unless the physical side is required by behavior.
- File names: Tailwind `truncate`; long errors: `[overflow-wrap:anywhere]`.
- Toast: `.tsx` when `description` needs JSX. Registry items depend on shadcn `toast`; npm apps import `Toaster` from `@dimah-s3/ui`.
