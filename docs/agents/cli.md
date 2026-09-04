# CLI (`@dimah-s3/cli`)

Published scaffold. Bin: `dimah-s3`. Primary command: `create`.

The CLI does **not** depend on `@dimah-s3/{core,server,react,ui,db}`. It ships in the same Tegami `dimah-s3` group.

Explore `packages/cli/src/` and `templates/`. Do not hand-edit `packages/cli/dist/templates/`.

## Create command

Two phases, never mixed:

1. **Resolve** — flags then prompts then `--yes`/non-TTY defaults (`create/config.ts`). A project directory is required; do not invent a silent `my-app`. Non-empty-target confirmation belongs here so steps never prompt.
2. **Steps** — `create/pipeline.ts` runs `createSteps`. All disk writes live here. The runner owns output (TTY spinner vs plain lines). Never call Clack `tasks()` (leaks the spinner on throw). Rollback only deletes a directory this run created.

Step shape: `CreateStep` in `create/step.ts`. Look at existing modules under `create/steps/`.

`src/` flattening is catalog-driven (`srcLayout` on the template entry). Do not assume every template prompts for it.

## Extending `create`

1. Flag on the command + field on `CreateConfig`.
2. Resolve it in `create/config.ts` (flag → prompt → `--yes`/non-TTY default).
3. Add a step under `create/steps/` and register it in `createSteps`.
4. Gate with `enabled`; mark `recoverable` when the project still works without the step.
5. Unit-test the pure parts; cover the flag path in the create e2e test.

Keep prompts in the config layer and filesystem writes in steps. If a step must rewrite template source, edit the AST (magicast), not string patches.

## Snapshot

On CLI `build`, the snapshot script copies each catalog id from `templates/<id>/`, pins `@dimah-s3/*` to the CLI version, and fails on `workspace:`, `catalog:`, or `@workspace/*`.

That script is the source of truth for copy/exclude/rewrite rules (including `.gitignore` → `_gitignore`). `tsup` uses `clean: true` on the bin entry, so the snapshot must run **after** tsup or `dist/templates/` is wiped.

`packages/cli/turbo.json` tracks `../../templates/**`. That glob does not honor gitignore — `node_modules` / `.next` / `dist` under templates are negated there and in root `.turboignore`. Do not drop those negations.

## Templates

Starters live in `templates/` — **not** a workspace member. See [templates/AGENTS.md](../../templates/AGENTS.md).

- New template: folder + `templates/catalog.json`. Add `examples/with-<id>/` only when it should be a monorepo demo.
- Root scripts `templates:*` / `examples:drift` / `deps:update` are in the repo `package.json`.
- Next.js is the example twin (`pnpm examples:drift`). Other starters may have no twin. `examples/with-db` is not a template twin.
