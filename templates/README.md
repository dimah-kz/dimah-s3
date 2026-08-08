# Templates

Standalone app starters for **end users**, snapshotted into `@dimah-s3/cli` at build time.

```bash
npx @dimah-s3/cli@latest create my-app
```

| Role                    | Path              | Consumes                                                         |
| ----------------------- | ----------------- | ---------------------------------------------------------------- |
| Templates (this folder) | `templates/<id>/` | Published `@dimah-s3/*` from npm (CLI snapshots + pins versions) |
| Examples                | `examples/*`      | Workspace packages (`workspace:*`) for local library development |

Do **not** treat these as library packages. They are outside the pnpm workspace. Starters must install cleanly with concrete npm ranges only (no `catalog:`, `workspace:*`, or `@workspace/*`).

## Catalog

| Id       | Framework | Notes                                              |
| -------- | --------- | -------------------------------------------------- |
| `nextjs` | Next.js   | Default. Optional `src/` flatten (`srcLayout`)     |
| `vite`   | Vite      | React SPA + Hono API                               |
| `hono`   | Hono      | Hono API + Vite React; `start` serves API + static |

```bash
npx @dimah-s3/cli@latest create my-app --template vite
```

## Adding a template

1. Create `templates/<id>/` as a self-contained app (concrete npm ranges only).
2. Pin `@dimah-s3/*` to published semver ranges (e.g. `^0.4.1`) — the CLI snapshot rewrites them to `^<cliVersion>` on build.
3. Add the id to [`catalog.json`](./catalog.json).
4. Document the create one-liner in the template `README.md` and docs Quickstart.
