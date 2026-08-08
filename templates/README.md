# Templates

Standalone app starters for **end users**. Copy via [degit](https://github.com/Rich-Harris/degit) today; `@dimah-s3/cli` can consume the same tree later.

| Role                    | Path              | Consumes                                                         |
| ----------------------- | ----------------- | ---------------------------------------------------------------- |
| Templates (this folder) | `templates/<id>/` | Published `@dimah-s3/*` from npm                                 |
| Examples                | `examples/*`      | Workspace packages (`workspace:*`) for local library development |

Do **not** add `templates/*` to `pnpm-workspace.yaml`. These apps must install cleanly outside the monorepo.

## Next.js

```bash
npx degit dimah-kz/dimah-s3/templates/nextjs my-app
cd my-app
cp .env.example .env   # fill S3_* credentials
npm install
npm run dev
```

Docs: [Quickstart](https://dimah-s3.vercel.app/docs/quickstart) · [Providers](https://dimah-s3.vercel.app/docs/providers)

## Adding a template

1. Create `templates/<id>/` as a self-contained app (no `workspace:*`, no `@workspace/*`).
2. Pin `@dimah-s3/*` to published semver ranges (e.g. `^0.4.1`).
3. Document the degit one-liner in the template `README.md` and docs Quickstart.
