# Templates

Standalone app starters for **end users**, snapshotted into `@dimah-s3/cli` at build time.

```bash
npx @dimah-s3/cli@latest create my-app
```

| Role                    | Path              | Consumes                                                         |
| ----------------------- | ----------------- | ---------------------------------------------------------------- |
| Templates (this folder) | `templates/<id>/` | Published `@dimah-s3/*` from npm (CLI snapshots + pins versions) |
| Examples                | `examples/*`      | Workspace packages (`workspace:*`) for local library development |

Do **not** treat these as library packages. Starters must install cleanly outside the monorepo (`catalog:` OK in-repo — resolved by the CLI snapshot; no `workspace:*` / `@workspace/*`).

## Adding a template

1. Create `templates/<id>/` as a self-contained app (no `workspace:*`, no `@workspace/*`).
2. Pin `@dimah-s3/*` to published semver ranges (e.g. `^0.4.1`) — the CLI snapshot rewrites them to `^<cliVersion>` on build.
3. Add the id to [`catalog.json`](./catalog.json).
4. Document the create one-liner in the template `README.md` and docs Quickstart.
