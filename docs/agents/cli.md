# CLI (`@dimah-s3/cli`)

> Rule: `.cursor/rules/cli.mdc`.

Published scaffold CLI. Bin: `dimah-s3`. Primary command: `create`.

## Placement

| Change                       | Path                                          |
| ---------------------------- | --------------------------------------------- |
| Command + flags              | `packages/cli/src/commands/`                  |
| Prompts / flag resolution    | `packages/cli/src/create/config.ts`           |
| Step order + next steps      | `packages/cli/src/create/pipeline.ts`         |
| Step contract + runner       | `packages/cli/src/create/step.ts`             |
| Individual steps             | `packages/cli/src/create/steps/`              |
| Target dir / name derivation | `packages/cli/src/create/target.ts`           |
| Template list SSOT           | `templates/catalog.json`                      |
| Template app source          | `templates/<id>/`                             |
| Build-time snapshot          | `packages/cli/scripts/snapshot-templates.mjs` |
| Pure package.json transforms | `packages/cli/src/snapshot/transform.ts`      |

CLI does **not** depend on `@dimah-s3/{core,server,react,ui,db}`. It is outside the library package chain and ships in the same Tegami `dimah-s3` sync-bump group.

## Create pipeline

Two phases, and they must not mix: **resolve** asks questions, **steps** touch the disk.

1. `commands/create.ts` parses argv (`citty`) and opens the error boundary.
2. `create/config.ts` merges flags with `@clack/prompts` answers into `CreateConfig` + the resolved template. Flags win; `--yes` and non-TTY sessions use defaults for optional choices, but a project directory is required (no silent `my-app`). Non-empty-target confirmation happens here too, so no step has to prompt.
3. `create/pipeline.ts` builds a `CreateContext` and runs `createSteps` in order, then prints the next steps note.
4. On an unrecoverable failure the pipeline rolls back — but only a target directory this run created.

Current steps: `scaffold` (prepare dir → copy snapshot → set `package.json` name → restore `_gitignore` → optionally flatten `src/` → copy `.env.example`), `install` (`nypm`), `git` (`init -b main` + initial commit).

Templates ship with a `src/` directory when the catalog entry sets `srcLayout: true` (Next.js only). `create` prompts for it only for those templates (default yes); `--src` / `--no-src` and `--yes` skip the prompt. Vite/Hono omit `srcLayout` — their `src/` layout is fixed (entry HTML and scripts). Flattening moves `src/*` to the project root and rewrites `tsconfig` / `components.json` path aliases.

## Step contract

`CreateStep` in `src/create/step.ts`:

| Field         | Purpose                                                            |
| ------------- | ------------------------------------------------------------------ |
| `id`          | Stable name used in errors and tests                               |
| `title`       | Reporter line; may be a function of the context                    |
| `enabled`     | Skip predicate (usually a `CreateConfig` flag)                     |
| `recoverable` | Failure warns, keeps going, and marks the run as non-zero exit     |
| `run`         | `(ctx, report) => Promise<string \| void>` — resolved message wins |

The runner owns all output: a spinner on a TTY, plain lines otherwise (animated frames flood CI logs). Do not call Clack's `tasks()` — it leaks the spinner interval when a task throws and hangs the process.

## Extending `create`

Adding an option (auto-setup a plugin, enable multipart, extra integrations):

1. Add the flag in `src/commands/create.ts` and the field on `CreateConfig` (`src/types.ts`).
2. Resolve it in `src/create/config.ts` — flag first, then prompt, then a default for `--yes`/non-TTY.
3. Add a step module under `src/create/steps/` and register it in `createSteps`.
4. Gate it with `enabled: (ctx) => ctx.config.<field>`; mark it `recoverable` when the project still works without it.
5. Cover the pure parts with unit tests and the flag path in `create.e2e.test.ts`.

Keep prompts in the config layer and filesystem writes in steps. A step that has to rewrite template source (for example wiring a plugin into `lib/s3.ts`) should edit the AST rather than patch strings — [`magicast`](https://github.com/unjs/magicast) is the intended tool and is not a dependency yet.

## Snapshot rules

On `pnpm --filter @dimah-s3/cli build`:

- Copy each catalog id from `templates/<id>/` (exclude `node_modules`, `.next`, `.turbo`, `dist`, `AGENTS.md`, lockfiles, `.env` / `.env.local`, `next-env.d.ts`, `.vercel`, `.DS_Store`, `.git`, `*.tsbuildinfo`).
- Rewrite every `@dimah-s3/*` range to `^<cliVersion>`.
- Fail on `workspace:`, `catalog:`, or `@workspace/*`.
- Rename `.gitignore` → `_gitignore` for the npm tarball.

`tsup` runs with `clean: true` on the bin entry, so the snapshot script must run after it — `dist/templates/` is wiped otherwise and the CLI reports a missing catalog.

`packages/cli/turbo.json` tracks `../../templates/**` as build inputs so template edits invalidate the CLI cache.

Each starter ships `pnpm-workspace.yaml` for pnpm 11 `allowBuilds` and `minimumReleaseAgeExclude` on `@dimah-s3/*`. Lockfiles are gitignored and snapshot-excluded.

## Template maintenance

Templates stay outside the monorepo workspace. Root scripts:

| Script                  | Purpose                                           |
| ----------------------- | ------------------------------------------------- |
| `pnpm templates:update` | `pnpm update --latest` in each `templates/<id>/`  |
| `pnpm templates:build`  | install + build + check-types per template        |
| `pnpm deps:update`      | `pnpm -r update --latest` then `templates:update` |

Optional id filter: `pnpm templates:build -- nextjs`. Scripts live under `scripts/templates-*.mjs` and read ids from `templates/catalog.json`.

## Adding a template

1. Add `templates/<id>/` (self-contained; concrete npm ranges only — no `workspace:*` / `catalog:` / `@workspace/*`).
2. Register it in `templates/catalog.json`.
3. Document in `templates/README.md` and docs Quickstart if it is a primary starter.

Interactive runs always show the Framework select (default / `initialValue`: first catalog entry — Next.js). Catalog starters today: `nextjs`, `vite`, `hono`. `--template`, `--yes`, and non-TTY sessions skip the prompt and use that default.
