# UI & shadcn registry

> Rule: `.cursor/rules/registry.mdc`.

**Source of truth:** `packages/ui/src/` (`components/`, `hooks/`, `lib/`).

**Generated (do not edit):** `registry/registry/dimah-s3-ui/` — copied by `packages/ui/scripts/sync-registry.mjs` on UI package build.

## When changing a UI component

1. Edit under `packages/ui/src/`.
2. Imports: short `@/` alias only (`@/components/ui/button`, `@/lib/utils`) — sync rewrites to `@/registry/dimah-s3-ui/...`.
3. `pnpm --filter @dimah-s3/ui build` (runs sync-registry).
4. If the shadcn item shape changed → update `registry/items/components.ts` (`files[]`, `registryDependencies` for shadcn primitives only).
5. `pnpm --filter @dimah-s3/registry build` → validates, writes `apps/docs/public/r/`, then runs workspace `pnpm format` so generated JSON matches Prettier (keeps `format:check` clean).

## Registry item rules

- Each item is self-contained — list every file the installer needs in `files[]`.
- `registryDependencies`: shadcn primitives (`button`, `progress`, …) only — not other `@dimah-s3` items.

## UI conventions (components)

- File names: Tailwind `truncate max-w-[30ch]`; errors: `[overflow-wrap:anywhere]`.
- Toast hooks are `.tsx` when sonner `description` needs JSX.

## Direction-safe CSS standard (LTR default, RTL-ready)

- Default docs/demo language is English and design targets LTR first.
- Components must use logical direction utilities so RTL can be enabled later without redesign.
- Prefer:
  - `text-start` / `text-end` instead of `text-left` / `text-right`
  - `ms-*` / `me-*` instead of `ml-*` / `mr-*`
  - `ps-*` / `pe-*` instead of `pl-*` / `pr-*`
  - `start-*` / `end-*` instead of `left-*` / `right-*`
- Use physical left/right only when behavior is physically side-locked and intentional.

Minimal examples:

```tsx
<span className="ms-auto text-end text-muted-foreground">42%</span>
```

```tsx
<p className="ps-5 text-start [overflow-wrap:anywhere]">Long error message…</p>
```

```tsx
<div className="absolute start-2 top-2">Badge</div>
```
