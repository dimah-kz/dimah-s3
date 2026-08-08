# `@dimah-s3/cli`

Scaffold an official [dimah-s3](https://dimah-s3.vercel.app) starter.

## Usage

```bash
npx @dimah-s3/cli@latest create my-app
pnpm dlx @dimah-s3/cli@latest create my-app
```

Non-interactive:

```bash
npx @dimah-s3/cli@latest create my-app --yes --template nextjs
```

### Options

| Flag                         | Description                                               |
| ---------------------------- | --------------------------------------------------------- |
| `-t, --template <id>`        | Template id (`nextjs`)                                    |
| `--package-manager <pm>`     | `pnpm` \| `npm` \| `yarn` \| `bun`                        |
| `--install` / `--no-install` | Install dependencies (default: prompt / yes with `--yes`) |
| `--git` / `--no-git`         | Initialize git (default: prompt / yes with `--yes`)       |
| `--overwrite`                | Allow a non-empty target directory                        |
| `-y, --yes`                  | Skip prompts and use defaults                             |

## Templates

Templates ship inside the CLI package (snapshotted from [`templates/`](../../templates) at build time).

## License

MIT
