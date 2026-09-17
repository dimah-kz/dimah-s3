# `@workspace/typescript-config`

Shared TypeScript configuration for the monorepo (`tooling/typescript-config`).

| Preset                 | Use for                                                 |
| ---------------------- | ------------------------------------------------------- |
| `base.json`            | NodeNext defaults (root scripts, tooling)               |
| `bundler-library.json` | `module`/`moduleResolution: Bundler`                    |
| `node-library.json`    | Published Node packages (`core`, `server`, `db`, `cli`) |
| `react-library.json`   | Published React packages (`react`, `ui`)                |
| `nextjs.json`          | Next.js apps (`docs`, `brand`, `examples/*`)            |

`base` keeps `noUncheckedIndexedAccess`. Packages that are not ready for it override it locally.
