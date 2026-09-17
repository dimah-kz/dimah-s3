# tooling/

Private workspace configs — not published.

| Package                        | Role                         |
| ------------------------------ | ---------------------------- |
| `@workspace/eslint-config`     | Shared ESLint flat configs   |
| `@workspace/typescript-config` | Shared `tsconfig` presets    |
| `@workspace/vitest-config`     | Shared Vitest package config |

Library packages live under `packages/`. Turbo `--filter="./packages/*"` does not include this folder.

`typescript-eslint` still parses with TypeScript 6 (`npm:@typescript/typescript6`) while packages compile with TypeScript 7. Keep that pin until typescript-eslint lists TS 7 as a peer.
