## brand@0.1.1

### Align create templates with 1.5.0

`dimah-s3 create` starters now require `@dimah-s3/*` 1.5.0. A fresh scaffold installs the current line, including signed `upload.object` options and catalog status on `useUpload`.

## brand@0.1.0

### Sign storage class, cache control, and tags from `upload.object`

Return `storageClass`, `cacheControl`, or `tagging` from `upload.object`. They are signed into PUT, POST, multipart init, and `putObject` so the browser cannot change them.

### Surface route catalog failures on `useUpload`

`policy.catalogStatus` and `policy.catalogError` report a failed `GET /routes` instead of failing silently. Uploads still run — the server enforces constraints. Pass `accept` / `maxFileSize` on the hook when the catalog is unavailable.
