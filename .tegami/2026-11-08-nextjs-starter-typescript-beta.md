---
packages:
  "@dimah-s3/cli":
    type: patch
    replay: []
---

### Next.js starter lints on TypeScript 6

The Next.js starter pins `typescript` to `^6.0.2`. `lint` runs. typescript-eslint does not support TypeScript 7, so `^7.0.2` exits before it checks the project.
