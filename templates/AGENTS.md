# templates/

CLI starter source for `@dimah-s3/cli`. **Not** a pnpm workspace member.

- Concrete npm ranges only — never `catalog:`, `workspace:*`, or `@workspace/*` (the snapshot build fails on those).
- Do not depend on `@workspace/eslint-config` or `@workspace/typescript-config`.
- Edit here for what consumers scaffold. `examples/with-*` are workspace demos — do not merge the two roles. Next.js shares source with `examples/with-nextjs` (`pnpm examples:drift`). Other starters may have no twin. `examples/with-db` is not a template twin.
- New template: folder + [`catalog.json`](./catalog.json). Add `examples/with-<id>/` only when it should be a monorepo demo.
- Each starter's `templates/<id>/AGENTS.md` is written for the coding agent of the scaffolded app, and `create` copies it into the app. No monorepo wording there.
- Maintenance: root `pnpm templates:update` / `templates:build` / `deps:update`. Do not add `templates/*` to the workspace.
- Each starter’s `pnpm-workspace.yaml` holds pnpm settings only: `allowBuilds` and the release-age excludes (`@dimah-s3/*` and `react-dropzone`, which ships with `@dimah-s3/react`). `create` removes it when the app uses another package manager, and the pnpm install it runs reads it, so keep it free of monorepo wording.
- Starter lockfiles are ignored by the root `.gitignore` and left out of the snapshot. A starter's own `.gitignore` must not list a lockfile: the scaffolded app commits the one its install writes (the snapshot build fails otherwise).
- All starters and `examples/with-nextjs` share one server setup: `env()` for the required `S3_*` variables, no `secret` option (the server reads `DIMAH_S3_SECRET`), and a commented `guard` stub on the route.
- The Next.js starter keeps `typescript` at `^6.0.2` so `lint` runs; `templates:update` restores that pin.
