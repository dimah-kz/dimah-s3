---
packages:
  "@dimah-s3/cli": patch
---

### Next.js starter lints on TypeScript 6

The Next.js starter pins `typescript` to `^6.0.2` again. `lint` runs. typescript-eslint does not support TypeScript 7, so `^7.0.2` made `eslint` exit before it checked the project.
