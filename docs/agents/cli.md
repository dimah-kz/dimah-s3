# CLI (`@dimah-s3/cli`)

> Rule: `.cursor/rules/cli.mdc`.

Published scaffold CLI. Bin: `dimah-s3`. Primary command: `create`.

## Placement

| Change                        | Path                                          |
| ----------------------------- | --------------------------------------------- |
| Commands / prompts / pipeline | `packages/cli/src/`                           |
| Template list SSOT            | `templates/catalog.json`                      |
| Template app source           | `templates/<id>/`                             |
| Build-time snapshot           | `packages/cli/scripts/snapshot-templates.mjs` |
| Pure package.json transforms  | `packages/cli/src/snapshot/transform.ts`      |

CLI does **not** depend on `@dimah-s3/{core,server,react,ui,db}`. It is outside the library package chain and ships in the same Tegami `dimah-s3` sync-bump group.

## Create pipeline

1. Parse argv (`citty`) + fill gaps with `@clack/prompts` (flags win; `--yes` skips prompts).
2. Build `CreateConfig`.
3. Validate name + empty target (unless `--overwrite`).
4. Copy `dist/templates/<id>` → target.
5. Set `package.json` `name`, restore `_gitignore` → `.gitignore`, copy `.env.example` → `.env`.
6. Optional `nypm` install + `git init`.
7. Print next steps (English).

## Snapshot rules

On `pnpm --filter @dimah-s3/cli build`:

- Copy each catalog id from `templates/<id>/` (exclude `node_modules`, `.next`, `.turbo`, `AGENTS.md`, `*.tsbuildinfo`).
- Rewrite every `@dimah-s3/*` range to `^<cliVersion>`.
- Fail on `catalog:`, `workspace:`, or `@workspace/*` (templates use concrete npm ranges only; they are not workspace members).
- Rename `.gitignore` → `_gitignore` for the npm tarball.

`packages/cli/turbo.json` sets `build.cache: false` because Turbo cannot track `templates/**` inputs outside the package.

## Adding a template

1. Add `templates/<id>/` (self-contained; concrete npm ranges only — no `catalog:` / `workspace:*` / `@workspace/*`).
2. Register it in `templates/catalog.json`.
3. Document in `templates/README.md` and docs Quickstart if it is a primary starter.

## Extending `create`

Add a field to `CreateConfig`, wire flag + prompt in `src/create/config.ts`, and implement a step under `src/create/steps/` (or a future addon). Keep UI on `@clack/prompts` only.
