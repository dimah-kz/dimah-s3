---
packages:
  group:dimah-s3: minor
---

### Sizes and counts in the user's locale

`S3Provider` accepts `locale`, such as `"fa"`. The built-in UI then formats sizes, counts, and percentages with that locale's digits: the usage line, upload status, delete confirmation, dropzone hints, and toasts. Unit labels are translation keys (`"MB(file size unit)"` and the rest), so a Persian map can show `۱۲٫۴ مگابایت`. Without `locale`, output is unchanged.

`formatFileSize(bytes, { locale, units })` in `@dimah-s3/core` takes the same options, and `formatSpeed` and `formatUploadProgress` pass them through. `useFormatFileSize()` and `useFormatNumber()` in `@dimah-s3/react` follow the provider for your own components. `dbObjectListAccessors({ formatSize })` takes a formatter for the row description.
