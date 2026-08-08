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

Each starter ships a local `pnpm-workspace.yaml` for pnpm 11 `allowBuilds` and `minimumReleaseAgeExclude` on `@dimah-s3/*`. Lockfiles stay gitignored and are excluded from the CLI snapshot — users get a fresh lock on `create` install.

## Maintenance (repo root)

| Script                  | What it does                                                                                          |
| ----------------------- | ----------------------------------------------------------------------------------------------------- |
| `pnpm templates:update` | `pnpm update --latest` in each `templates/<id>/` (rewrites ranges; lockfiles stay local / gitignored) |
| `pnpm templates:build`  | `pnpm install` + `build` + `check-types` smoke test per template                                      |
| `pnpm deps:update`      | Workspace `pnpm -r update --latest`, then `templates:update`                                          |

Filter by id: `pnpm templates:build -- nextjs` / `pnpm templates:update -- vite hono`.

Day-to-day library work still belongs in `examples/*` (`workspace:*`). Use these scripts when bumping starter deps or verifying a scaffold still builds.

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
