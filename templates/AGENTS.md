# templates/

User-facing starters for `@dimah-s3/cli`. **Not** a pnpm workspace member — keep concrete npm ranges only so `pnpm -r update` cannot rewrite them to `catalog:`.

- **Edit here** when changing what consumers scaffold.
- **`examples/with-*`** are monorepo demos (`workspace:*`) — do not merge the two roles. Next.js shares source with `examples/with-nextjs` (`pnpm examples:drift`). Vite and Hono have no example twins. `examples/with-db` is DB-only.
- New template → add folder + update [`catalog.json`](./catalog.json); add `examples/with-<id>/` only when it should be a monorepo demo.
- **Never** use `catalog:`, `workspace:*`, or `@workspace/*` — the CLI snapshot build fails on those.
- Never depend on `@workspace/eslint-config` or `@workspace/typescript-config`; keep tsconfig/eslint self-contained.
- Dep bumps / smoke builds: root `pnpm templates:update`, `pnpm templates:build`, or combined `pnpm deps:update` (workspace + templates). Do not add `templates/*` to the monorepo workspace.
- Each starter’s `pnpm-workspace.yaml` is for pnpm 11 `allowBuilds` / `@dimah-s3/*` release-age excludes only — lockfiles stay gitignored and out of the CLI snapshot.
- End-user agent notes live in each template app (e.g. `templates/nextjs/AGENTS.md`) — no monorepo wording there.
