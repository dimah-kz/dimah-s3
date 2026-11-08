---
packages:
  "@dimah-s3/cli": patch
---

### Starters install a same-day react-dropzone

Scaffolded projects exclude `react-dropzone` from pnpm's minimum release age. `@dimah-s3/react` depends on it, so a release published the same day still installs. Other packages keep the release-age check.
