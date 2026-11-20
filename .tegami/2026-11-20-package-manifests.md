---
packages:
  group:dimah-s3: major
---

### One Node.js floor and bounded peer ranges

Every `@dimah-s3/*` package declares `engines.node` `>=22`, exports its `package.json`, and names the peer majors it is built against. Keep every `@dimah-s3/*` package on the same version.

- **`./package.json`.** Every package exports it, so a tool can read the installed version: `import pkg from "@dimah-s3/core/package.json" with { type: "json" }`.
- **`funding`.** Every package links the sponsor page.

#### Breaking changes

- **Use Node.js 22 or newer.** Every package declares `engines.node` `>=22`. Only `@dimah-s3/cli` declared a floor before (`>=20.19`).
- **Check your peer versions.** Open-ended ranges such as `>=19.2` now end at the next major:
  - `@dimah-s3/react` and `@dimah-s3/ui`: `react` `^19.2.0`.
  - `@dimah-s3/ui`: `react-dom` `^19.2.0` (a new peer), `@base-ui/react` `^1.0.0`, `class-variance-authority` `^0.7.0`, `cn` `^0.5.2`, and `lucide-react` `>=0.400.0 <2`.
  - `@dimah-s3/server` and `@dimah-s3/db`: `@aws-sdk/client-s3` `^3.0.0`.
  - `@dimah-s3/db`: `kysely` `^0.29.8`.
- **Install `@aws-sdk/client-s3` next to `@dimah-s3/db`.** It is a required peer. It was marked optional, but the plugin imports it.
