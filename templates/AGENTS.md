# templates/

CLI starter source for `@dimah-s3/cli`. **Not** a pnpm workspace member.

- Concrete npm ranges only — never `catalog:`, `workspace:*`, or `@workspace/*` (the snapshot build fails on those).
- Do not depend on `@workspace/eslint-config` or `@workspace/typescript-config`.
- Edit here for what consumers scaffold. `examples/with-*` are workspace demos — do not merge the two roles. Next.js shares source with `examples/with-nextjs` (`pnpm examples:drift`). Other starters may have no twin. `examples/with-db` is not a template twin.
- New template: folder + [`catalog.json`](./catalog.json). Add `examples/with-<id>/` only when it should be a monorepo demo.
- End-user agent notes live in each starter (`templates/<id>/AGENTS.md`) — no monorepo wording there.
- Maintenance: root `pnpm templates:update` / `templates:build` / `deps:update`. Do not add `templates/*` to the workspace.
- Each starter’s `pnpm-workspace.yaml` is for pnpm 11 `allowBuilds` / `@dimah-s3/*` release-age excludes. Lockfiles stay gitignored and out of the snapshot.
