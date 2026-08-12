---
packages:
  group:dimah-s3: minor
---

### UI color tokens with shadcn defaults

`@dimah-s3/ui` now uses prefixed `--color-dimah-s3-*` theme tokens for dimah-owned
chrome (progress, dropzone accents, overlays). Importing
`@dimah-s3/ui/styles.css` maps them to your shadcn variables by default
(`--primary`, `--muted`, …). Override `--color-dimah-s3-*` to theme the library
independently. The bridge is also exported as `@dimah-s3/ui/css/shadcn.css`.
