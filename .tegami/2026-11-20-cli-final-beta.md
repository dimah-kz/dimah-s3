---
packages:
  "@dimah-s3/cli": major
---

### `create` refuses typos, cancels cleanly, and starters commit their lockfile

`dimah-s3 create` stops on an argument it does not know, cleans up after Ctrl+C, and installs the way you would. A new app commits its lockfile and comes with an `AGENTS.md`.

- **Install.** `create` runs your package manager's own install in the new project (`pnpm install`, `npm install`, `yarn`, `bun install`). A pnpm install reads the starter's `pnpm-workspace.yaml`, and nothing goes through corepack.
- **Ctrl+C.** Cancelling while a step runs stops the install, removes the directory `create` made, and exits with `130`. Files written into a directory that already existed are left in place.
- **`AGENTS.md`.** Each starter ships its notes for the app's coding agent.
- **`pnpm-workspace.yaml`.** It is kept for pnpm and removed for npm, yarn, and bun. It excludes `@dimah-s3/*` and `react-dropzone` from pnpm's release-age wait.
- **Starter server setup.** All three starters read the required `S3_*` variables through one `env()` helper that names the missing variable, leave `DIMAH_S3_SECRET` to the server, and carry a commented `guard` stub on the `avatar` route, which is open until you add one.
- **`start` without a `.env` file.** The Vite and Hono starters start with `--env-file-if-exists`, and `tsx` is a dependency, so a host that injects the environment can run them.
- **`--no-src`.** The README of a flattened Next.js app names the flattened paths.
- **Non-empty directory.** The question comes right after the project name, before the other prompts.
- **Errors** are written to stderr.

#### Breaking changes

- **Use Node.js 22 or newer.** `engines.node` is `>=22`. It was `>=20.19`.
- **Fix unknown options and extra arguments.** `create --templte vite my-app` and `create my-app extra` fail with exit code `1` before anything is written. They used to be ignored, and the first one scaffolded the default starter into `./vite`.
- **Give the project an ASCII name.** A directory name with no ASCII letter or digit fails. The package used to be named `my-app`.
- **Expect exit code `1` after a "no" to replacing a non-empty directory.** It was `130`, which now only means Ctrl+C.
- **Commit the lockfile.** The starter `.gitignore` no longer ignores `pnpm-lock.yaml`, `package-lock.json`, and `yarn.lock`.
- **Set every required variable before `next build`.** The Next.js starter reads `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, and `S3_BUCKET` when its route module loads, and a missing one throws by name. Only `S3_BUCKET` was needed at build time.
- **Run the bin.** The package has no importable entry: `import "@dimah-s3/cli"` used to run the CLI. Use `npx @dimah-s3/cli create`.
