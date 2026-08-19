# @dimah-s3/registry

Private shadcn registry for [dimah-s3](https://dimah-s3.vercel.app).

DB schema examples live in `packages/db/src/schema/examples/` — not here.

| Path                     | Role                                                               |
| ------------------------ | ------------------------------------------------------------------ |
| `items/*.ts`             | **Source of truth** — typed with `satisfies Registry`              |
| `generated/dimah-s3-ui/` | Synced TSX from `@dimah-s3/ui` + generated `registry.json` chunks |
| `registry.json`          | Root catalog (`include` only)                                      |

---

## Commands

```bash
pnpm --filter @dimah-s3/registry build-items   # items/*.ts → registry.json chunks
pnpm --filter @dimah-s3/registry validate      # build-items + shadcn registry validate
pnpm --filter @dimah-s3/registry build         # build-items → validate → public/r → format workspace
pnpm --filter @dimah-s3/registry check-types   # typecheck items/*.ts
```

Install: `pnpm dlx shadcn add @dimah-s3/upload-dropzone` (namespace in template `components.json`).

Each registry item is self-contained: list every file the user needs in `files[]` (including hooks). Use `registryDependencies` only for shadcn primitives (`button`, `progress`, …), not other `@dimah-s3` items. Do not give a dimah `lib/` file the same basename as a primitive (`attachment.ts` collides with shadcn `attachment`).

---

## Adding an item

1. Component in `packages/ui/src/`.
2. Entry in `items/components.ts` — `path` is relative to `generated/dimah-s3-ui/` (e.g. `components/dimah-s3/upload/…`, `hooks/…`). Install `target`s use `@components/dimah-s3/…` so files land next to — not inside — the consumer's `components/ui`.
3. `pnpm --filter @dimah-s3/registry build`.
