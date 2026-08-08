# dimah-s3-ui Registry Source Policy

This directory is generated from the UI package source.

- Source of truth: `packages/ui/src/{components,hooks,lib}`
- Generated target: `registry/registry/dimah-s3-ui/{components,hooks,lib}`
- Sync command: `pnpm --filter @dimah-s3/ui sync-registry`

`sync-registry` first normalizes internal source imports to `@/` and then syncs files.

`sync-registry` also ensures required UI dependencies exist in `registry/package.json`.
It only adds missing UI deps and does not remove registry-specific extras.

Do not directly edit the files under `components`, `hooks`, or `lib` here.

If you need to change dimah-s3 UI components:

1. Edit files in `packages/ui/src`
2. Run `pnpm --filter @dimah-s3/ui sync-registry`
3. Commit both source and generated registry updates

Note: Other registry areas outside `registry/registry/dimah-s3-ui` may still be edited directly when needed.

`registry` build already runs sync first:
`pnpm --filter @dimah-s3/ui sync-registry && shadcn build ...`
