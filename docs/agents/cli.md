# CLI (`@dimah-s3/cli`)

Published scaffold. Bin: `dimah-s3`. Primary command: `create`.

The CLI does **not** depend on `@dimah-s3/{core,server,react,ui,db}`. It ships in the same Tegami `dimah-s3` group.

Explore `packages/cli/src/` and `templates/`. Do not hand-edit `packages/cli/dist/templates/`.

## Create command

Two phases, never mixed:

1. **Resolve** — flags then prompts then `--yes`/non-TTY defaults (`create/config.ts`). A project directory is required; do not invent a silent `my-app`: a directory that sanitises to no package name is a `CliError`. Non-empty-target confirmation belongs here, right after the name, so steps never prompt. Declining it is a failure (exit 1), not a cancel.
2. **Steps** — `create/pipeline.ts` runs `createSteps`. All disk writes live here. The runner owns output (TTY spinner vs plain lines). Never call Clack `tasks()` (leaks the spinner on throw) or Clack `spinner()` (it puts stdin in raw mode and exits 0 on Ctrl+C): use `spinner()` from `utils/ui.ts`. Rollback only deletes a directory this run created.

`assertKnownArgs` (`utils/args.ts`) runs before anything else: citty accepts unknown flags and extra positionals in silence. Declare a new flag in `createArgs` and it is accepted.

Cancel: the pipeline listens for the first SIGINT / SIGTERM (`utils/cancel.ts`) and hands every step an `AbortSignal`. A step passes it to the processes it starts (`runCommand` in `utils/process.ts` stops the whole process tree) and the runner ends the run with exit code 130 after rollback. Do not spawn through a helper that hides the child (nypm): it could not be stopped. Errors print to stderr (`logError`).

Step shape: `CreateStep` in `create/step.ts`. Look at existing modules under `create/steps/`.

`src/` flattening is catalog-driven (`srcLayout` on the template entry). Do not assume every template prompts for it.

## Extending `create`

1. Flag on the command + field on `CreateConfig`.
2. Resolve it in `create/config.ts` (flag → prompt → `--yes`/non-TTY default).
3. Add a step under `create/steps/` and register it in `createSteps`.
4. Gate with `enabled`; mark `recoverable` when the project still works without the step.
5. Unit-test the pure parts; cover the flag path in the create e2e test.

Keep prompts in the config layer and filesystem writes in steps. If a step must rewrite template source, edit the AST (magicast), not string patches.

## Generated env

`create/env.ts` owns the keys `create` fills in `.env` (`GENERATED_ENV_KEYS`, today `DIMAH_S3_SECRET`). The scaffold step calls `writeProjectEnv`, and `CreateContext.generatedEnv` drives the next-steps note.

- A new `.env` starts from `.env.example` and gets a fresh value for every generated key.
- An existing `.env` is only appended to or filled where the key is empty. Never overwrite a value that is set.
- Never print a generated value. Name the key only.

A new generated key goes in `GENERATED_ENV_KEYS` with its generator, in every template's `.env.example` as an empty assignment, and in the env unit test.

## Snapshot

On CLI `build`, the snapshot script copies each catalog id from `templates/<id>/`, pins `@dimah-s3/*` to `^<cliVersion>` (the exact version when the CLI is a prerelease), and fails on `workspace:`, `catalog:`, or `@workspace/*`. It never copies local env files, and it fails when a template's `.env.example` does not list an empty `DIMAH_S3_SECRET` or when its `.gitignore` ignores a lockfile. Each starter's `AGENTS.md` is copied: it is written for the scaffolded app's coding agent.

The script imports `src/snapshot/transform.ts` as source (Node strips the types). The published package is the bin and `dist/templates` only: no `exports["."]`, and no build helper in `dist`.

That script is the source of truth for copy/exclude/rewrite rules (including `.gitignore` → `_gitignore`). `tsup` uses `clean: true` on the bin entry, so the snapshot must run **after** tsup or `dist/templates/` is wiped.

`packages/cli/turbo.json` tracks `../../templates/**`. That glob does not honor gitignore — `node_modules` / `.next` / `dist` under templates are negated there and in root `.turboignore`. Do not drop those negations.

## Templates

Starters live in `templates/` — **not** a workspace member. See [templates/AGENTS.md](../../templates/AGENTS.md).

- New template: folder + `templates/catalog.json`. Add `examples/with-<id>/` only when it should be a monorepo demo.
- Root scripts `templates:*` / `examples:drift` / `deps:update` are in the repo `package.json`.
- Templates list `@dimah-s3/core` next to server, react, and ui. Source ranges are placeholders; the snapshot rewrites them to the CLI version (`^<version>` on `main`, the exact `2.0.0-beta.N` on `v2`). `pnpm templates:update` follows `latest` for other deps, then on a prerelease CLI pins `@dimah-s3/*` to the npm `beta` dist-tag. The CLI test keeps the placeholders honest without blocking a Version Packages PR: every starter pins the same version, on the CLI's major, and never ahead of the CLI. Before a release is on npm, check them with `pnpm templates:build -- --local`, which installs packed workspace packages.
- The scaffold step removes the starter's `pnpm-workspace.yaml` unless the app uses pnpm, and the install step runs the package manager's own install without `--ignore-workspace`, so pnpm reads that file.
- Next.js is the example twin (`pnpm examples:drift`). Other starters may have no twin. `examples/with-db` is not a template twin.
