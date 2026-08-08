# templates/

User-facing starters for `@dimah-s3/cli`. Listed in the pnpm workspace so `catalog:` can resolve during monorepo installs, but apps must stay installable outside the monorepo.

- **Edit here** when changing what consumers scaffold.
- **`examples/*`** mirror the same app shape with `workspace:*` for monorepo demos — do not merge the two roles.
- New template → add folder + update [`catalog.json`](./catalog.json).
- `catalog:` ranges are allowed (CLI snapshot resolves them). **Never** use `workspace:*` or `@workspace/*` — that fails the CLI build.
- Never depend on `@workspace/eslint-config` or `@workspace/typescript-config`; keep tsconfig/eslint self-contained.
- End-user agent notes live in each template app (e.g. `templates/nextjs/AGENTS.md`) — no monorepo wording there.
