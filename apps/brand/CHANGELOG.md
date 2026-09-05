## brand@0.1.5

### Expand npm package search keywords

Keywords on `@dimah-s3/server`, `@dimah-s3/react`, `@dimah-s3/ui`, `@dimah-s3/db`, `@dimah-s3/cli`, and `@dimah-s3/core` now include targeted search terms (UploadThing / Better Upload alternative, Cloudflare R2 / MinIO, shadcn uploader, multipart resumable upload, and framework adapters).

## brand@0.1.4

### Refresh scaffold starter dependencies

`dimah-s3 create` apps now install AWS SDK 3.1126, Base UI 1.8, shadcn 4.21, and matching lucide/cn ranges. `@dimah-s3/server` uses the same AWS SDK patch.

## brand@0.1.3

### Point docs and registry URLs at s3.dimah.dev

Published homepage fields, the CLI success link, and scaffolded `components.json` registry entries now use https://s3.dimah.dev.

## brand@0.1.2

### Import `cn` from the `cn` package

`@dimah-s3/ui` now imports class names from [`cn`](https://www.npmjs.com/package/cn), matching shadcn's default. There is no `lib/utils.ts` helper. Install `cn` instead of `cnfast`. Registry items declare `cn` so `shadcn add` installs it.

## brand@0.1.1

### Align create templates with 1.5.0

`dimah-s3 create` starters now require `@dimah-s3/*` 1.5.0. A fresh scaffold installs the current line, including signed `upload.object` options and catalog status on `useUpload`.

## brand@0.1.0

### Sign storage class, cache control, and tags from `upload.object`

Return `storageClass`, `cacheControl`, or `tagging` from `upload.object`. They are signed into PUT, POST, multipart init, and `putObject` so the browser cannot change them.

### Surface route catalog failures on `useUpload`

`policy.catalogStatus` and `policy.catalogError` report a failed `GET /routes` instead of failing silently. Uploads still run — the server enforces constraints. Pass `accept` / `maxFileSize` on the hook when the catalog is unavailable.
