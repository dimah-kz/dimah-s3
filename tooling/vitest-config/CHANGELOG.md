## @workspace/vitest-config@0.0.4

### Refresh scaffold starter dependencies

`dimah-s3 create` apps now install AWS SDK 3.1126, Base UI 1.8, shadcn 4.21, and matching lucide/cn ranges. `@dimah-s3/server` uses the same AWS SDK patch.

## @workspace/vitest-config@0.0.3

### Point docs and registry URLs at s3.dimah.dev

Published homepage fields, the CLI success link, and scaffolded `components.json` registry entries now use https://s3.dimah.dev.

## @workspace/vitest-config@0.0.2

### Import `cn` from the `cn` package

`@dimah-s3/ui` now imports class names from [`cn`](https://www.npmjs.com/package/cn), matching shadcn's default. There is no `lib/utils.ts` helper. Install `cn` instead of `cnfast`. Registry items declare `cn` so `shadcn add` installs it.
