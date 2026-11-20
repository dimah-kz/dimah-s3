# `@dimah-s3/cli`

**2.0 beta.** Install with `@beta`. `@latest` stays on 1.x ([v1.s3.dimah.dev](https://v1.s3.dimah.dev/docs)), and betas can include breaking changes until 2.0.0.

Scaffold an official [dimah-s3](https://s3.dimah.dev/docs) starter.

[Docs](https://s3.dimah.dev/docs/quickstart) · [llms.txt](https://s3.dimah.dev/llms.txt)

Requires Node.js 22 or newer.

## Usage

```bash
npx @dimah-s3/cli@beta create my-app
```

Into the current directory (package name = folder name):

```bash
npx @dimah-s3/cli@beta create .
```

Skip prompts:

```bash
npx @dimah-s3/cli@beta create my-app --yes
```

### Options

| Flag                         | Description                                               |
| ---------------------------- | --------------------------------------------------------- |
| `-t, --template <id>`        | Template id (`nextjs` \| `vite` \| `hono`)                |
| `--package-manager <pm>`     | `pnpm` \| `npm` \| `yarn` \| `bun` (default: detected)    |
| `--install` / `--no-install` | Install dependencies (default: prompt / yes with `--yes`) |
| `--git` / `--no-git`         | Initialize git (default: prompt / yes with `--yes`)       |
| `--src` / `--no-src`         | Next.js (`srcLayout`) only: keep or flatten `src/`        |
| `--overwrite`                | Replace the contents of a non-empty directory             |
| `-y, --yes`                  | Skip prompts and use defaults                             |

`dimah-s3 --version` prints the CLI version.

### Behavior

- **Project name** is required with `--yes` or on a non-TTY (CI / piped input).
  Interactive runs still prompt when the directory argument is omitted.
- **Other prompts** (Framework, install, git) are only used on an interactive
  terminal. Framework defaults to the first catalog entry (Next.js). Available
  starters: `nextjs`, `vite`, `hono`. The `src/` prompt / `--src` flag applies
  only to templates with `srcLayout` (Next.js). Vite and Hono always keep
  `src/`; passing `--src` / `--no-src` for them is ignored with a warning.
  Non-interactive sessions fall back to the same defaults (`src/` for Next.js).
- **Unknown options and extra arguments** stop the run before anything is
  written. `create --templte vite my-app` is an error, not a default starter
  in `./vite`.
- **Project name:** the package name comes from the directory name. A name
  with no ASCII letter or digit is an error; `create` never invents one.
- **Non-empty target:** asked right after the project name. The run stops
  unless `--overwrite` is passed (or the prompt is confirmed). Overwriting
  clears the directory contents but keeps `.git` and `.env`, and never removes
  the directory itself.
- **Install:** runs your package manager's own install in the new project
  (`pnpm install`, `npm install`, `yarn`, `bun install`), so the lockfile it
  writes is yours to commit. A failed install keeps the project and the final
  instructions tell you to install manually; the exit code is still non-zero.
- **pnpm settings:** the starter's `pnpm-workspace.yaml` is kept for pnpm and
  removed for every other package manager.
- **Git:** initializes on `main` and makes an initial commit. Skipped when the
  target is already inside a repository.
- **Ctrl+C:** stops the running step and the install it started. A directory
  that `create` made is removed; files written into a directory that already
  existed are left in place. A second Ctrl+C ends the process at once.
- **Errors** are written to stderr.

### Exit codes

| Code  | Meaning                                                        |
| ----- | -------------------------------------------------------------- |
| `0`   | Success                                                        |
| `1`   | Failure, including a "no" to replacing a non-empty directory   |
| `130` | Cancelled with Ctrl+C, at a prompt or while a step was running |

## Templates

Templates ship inside the CLI package (snapshotted from [`templates/`](../../templates) at build time). Each starter comes with an `AGENTS.md` for your coding agent and a `.gitignore` that keeps `.env` out of git and the lockfile in it.

The package has a `dimah-s3` bin and no importable entry.

## License

MIT
