# templates/

User-facing starters (degit / future `@dimah-s3/cli`). Not part of the pnpm workspace.

- **Edit here** when changing what consumers scaffold.
- **`examples/*`** mirror the same app shape with `workspace:*` for monorepo demos — do not merge the two roles.
- New template → add folder + update [`catalog.json`](./catalog.json).
- Never depend on `@workspace/eslint-config` or `@workspace/typescript-config`; keep tsconfig/eslint self-contained.
- End-user agent notes live in each template app (e.g. `templates/nextjs/AGENTS.md`) — no monorepo wording there.
