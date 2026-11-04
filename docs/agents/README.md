# Maintainer agent docs

Not a map of the repo. Explore `packages/*/src` for what exists.

| Layer                                  | Role                                             |
| -------------------------------------- | ------------------------------------------------ |
| Root [AGENTS.md](../../AGENTS.md)      | Always on. Invariants only.                      |
| [.cursor/rules/](../../.cursor/rules/) | Landmines for the files being edited.            |
| This directory                         | Checklists when **changing published behavior**. |

If an agent can see it in source (paths, schemas, hook names, current endpoints), it does not belong here. Put **constraints and sync rules** here, not a snapshot of the tree.

| File                                 | Read when                                       |
| ------------------------------------ | ----------------------------------------------- |
| [architecture.md](./architecture.md) | New package, or moving behavior across packages |
| [packages.md](./packages.md)         | Protocol, endpoint, plugin, or hook             |
| [registry.md](./registry.md)         | UI or shadcn registry item                      |
| [cli.md](./cli.md)                   | Scaffold CLI / templates                        |
| [changelog.md](./changelog.md)       | Writing or editing a `.tegami` changelog        |
| [release.md](./release.md)           | Tegami version bump / publish                   |
| [brand.md](./brand.md)               | Brand studio still / video                      |
