# tooling/

Private workspace configs — not published.

| Package                        | Role                         |
| ------------------------------ | ---------------------------- |
| `@workspace/eslint-config`     | Shared ESLint flat configs   |
| `@workspace/typescript-config` | Shared `tsconfig` presets    |
| `@workspace/vitest-config`     | Shared Vitest package config |

Library packages live under `packages/`. Turbo `--filter="./packages/*"` does not include this folder.
