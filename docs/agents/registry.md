# UI & shadcn registry

> Rule: `.cursor/rules/registry.mdc`.

**Source of truth:** `packages/ui/src/` — shadcn primitives under `components/ui/`; dimah-owned UI under `components/dimah-s3/` (hooks in `hooks/`, shared helpers in `lib/`).

**Generated (do not edit):** `registry/generated/dimah-s3-ui/` — copied by `packages/ui/scripts/sync-registry.mjs` on UI package build.

## Do not edit stock shadcn (`components/ui/`)

`packages/ui/src/components/ui/*` are **vendor primitives** installed via shadcn CLI. Agents and humans must **not** hand-edit them (no new exports, prop renames, style tweaks, or type aliases).

| Own the change in…     | Examples                                                                                                    |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| `components/dimah-s3/` | `attachment/`, upload/download/delete buttons, status rows                                                  |
| `hooks/` / `lib/`      | toast hooks, attachment layout types in `lib/attachment-layout.ts` (`AttachmentState`, `AttachmentSize`, …) |

To refresh primitives to upstream: `pnpm --filter @dimah-s3/ui sync:shadcn` (overwrite). Compose on top — never fork the stock file.

## When changing a UI component

1. Edit under `packages/ui/src/` — **only** `components/dimah-s3/`, `hooks/`, or `lib/` for product behavior. Do not edit `components/ui/`.
2. Imports: short `@/` alias only (`@/components/ui/button`, `@/lib/utils`) — sync rewrites to `@/registry/dimah-s3-ui/...`.
3. `pnpm --filter @dimah-s3/ui build` (runs sync-registry).
4. If the shadcn item shape changed → update `registry/items/components.ts` (`files[]`, `registryDependencies` for shadcn primitives only).
5. `pnpm --filter @dimah-s3/registry build` → validates, writes `apps/docs/public/r/`, then runs workspace `pnpm format` so generated JSON matches Prettier (keeps `format:check` clean).

## Registry item rules

- Each item is self-contained — list every file the installer needs in `files[]` (hooks included). `pnpm --filter @dimah-s3/registry build-items` runs `scripts/check-items.ts` and fails if a local `@/` import is missing from `files[]`.
- `registryDependencies`: shadcn primitives (`button`, `progress`, `attachment`, …) only — not other `@dimah-s3` items.
- **No basename collision** with those primitives. `lib/attachment.ts` is rewritten by the shadcn CLI onto `@/components/ui/attachment` — layout helpers live in `lib/attachment-layout.ts`.
- `dependencies` / `devDependencies`: every npm import the copied source uses (`@fuma-translate/react`, `@types/react-file-icon`, …). `@/lib/utils` is the consumer's shadcn `cn` — do not ship `lib/utils.ts`.
- `cssVars.theme`: `--color-dimah-s3-*` bridge (same map as `packages/ui/css/shadcn.css`) so registry-only apps get utilities without `@dimah-s3/ui`.
- Standalone status rows: `@dimah-s3/file-attachment` (`FileAttachment` / `StatusAttachment`). Upload/download/delete items still **bundle** those files (they do not depend on the dimah item).

## UI conventions (components)

- File names: Tailwind `truncate max-w-[48ch]`; errors: `[overflow-wrap:anywhere]`.
  - `truncateFileName` default is 48 printable chars (extension preserved).
- Toast hooks are `.tsx` when toast `description` needs JSX.
- Toast: shadcn Base UI. Registry → `registryDependencies: toast` + `<Toaster />` from `@/components/ui/toast`. npm → `<Toaster />` from `@dimah-s3/ui`.

## Color tokens (dimah-owned UI)

Dimah-owned components under `components/dimah-s3/` use prefixed utilities
(`bg-dimah-s3-primary`, `text-dimah-s3-muted-foreground`, …) backed by
`packages/ui/css/shadcn.css` (imported from `styles.css`). Defaults map to the
host shadcn vars (`--primary`, `--muted-foreground`, …). Do **not** use bare
`bg-primary` / `text-muted-foreground` in `components/dimah-s3/` — keep those
for stock `components/ui/` primitives only.

Consumers override `--color-dimah-s3-*` to theme the library alone. Docs:
`apps/docs/content/docs/react/ui/customization/theming.mdx`.

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
<span className="ms-auto text-end text-dimah-s3-muted-foreground">42%</span>
```

```tsx
<p className="ps-5 text-start [overflow-wrap:anywhere]">Long error message…</p>
```

```tsx
<div className="absolute start-2 top-2">Badge</div>
```
