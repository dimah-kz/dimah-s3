# `@dimah-s3/cli`

Scaffold an official [dimah-s3](https://dimah-s3.vercel.app/docs) starter.

[Docs](https://dimah-s3.vercel.app/docs/quickstart) · [llms.txt](https://dimah-s3.vercel.app/llms.txt)

## Usage

```bash
npx @dimah-s3/cli@latest create my-app
```

Into the current directory (package name = folder name):

```bash
npx @dimah-s3/cli@latest create .
```

Skip prompts:

```bash
npx @dimah-s3/cli@latest create my-app --yes
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
| `--version`                  | Print the CLI version                                     |

### Behavior

- **Project name** is required with `--yes` or on a non-TTY (CI / piped input).
  Interactive runs still prompt when the directory argument is omitted.
- **Other prompts** (Framework, install, git) are only used on an interactive
  terminal. Framework defaults to the first catalog entry (Next.js). Available
  starters: `nextjs`, `vite`, `hono`. The `src/` prompt / `--src` flag applies
  only to templates with `srcLayout` (Next.js). Vite and Hono always keep
  `src/`; passing `--src` / `--no-src` for them is ignored with a warning.
  Non-interactive sessions fall back to the same defaults (`src/` for Next.js).
- **Non-empty target:** the run stops unless `--overwrite` is passed (or the
  prompt is confirmed). Overwriting clears the directory contents but keeps
  `.git` and `.env`, and never removes the directory itself.
- **Failed install:** the project is kept and the final instructions tell you to
  install manually; the exit code is still non-zero.
- **Git:** initializes on `main` and makes an initial commit. Skipped when the
  target is already inside a repository.

### Exit codes

| Code  | Meaning                      |
| ----- | ---------------------------- |
| `0`   | Success                      |
| `1`   | Failure                      |
| `130` | Cancelled (Ctrl+C or a "no") |

## Templates

Templates ship inside the CLI package (snapshotted from [`templates/`](../../templates) at build time).

## License

MIT
