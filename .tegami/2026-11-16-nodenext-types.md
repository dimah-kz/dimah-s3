---
packages:
  "@dimah-s3/core": patch
  "@dimah-s3/server": patch
  "@dimah-s3/react": patch
  "@dimah-s3/db": patch
---

### Types resolve under NodeNext

The declaration files of `@dimah-s3/core`, `@dimah-s3/server`, `@dimah-s3/react`, and `@dimah-s3/db` import each other by their `.js` paths. A project with `moduleResolution` set to `NodeNext` or `Node16` gets the same types as one on `Bundler`.

- **`export *` names resolve.** Importing `buildObjectKey` or another re-exported helper from `@dimah-s3/core` no longer fails with `TS2305`.
- **Values keep their types.** `dimahS3`, `route`, `useUpload`, `db`, and the other re-exported values are no longer `any`. Code that passed `tsc` only because they were `any` now reports its type errors.
- **`skipLibCheck: false` passes.** `tsc` no longer reports `TS2834` or `TS2835` inside these packages.
