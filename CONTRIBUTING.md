# Contributing

Thanks for your interest in contributing to this project.

## Prerequisites

- Node.js 24+
- pnpm 11+

## Development setup

```bash
pnpm install
```

## Useful commands

```bash
pnpm build
pnpm check-types
pnpm lint
pnpm registry:validate
```

`pnpm build` compiles workspace packages and the docs app. It skips `examples/*` (those are extra Next/Vite production builds). Other entry points:

```bash
pnpm build:packages   # library packages only
pnpm build:all        # packages + docs + examples (heavy RAM — three Next.js apps)
```

On a memory-constrained machine (e.g. while the editor is open), prefer `pnpm build:packages`.

Run commands for a specific package:

```bash
pnpm --filter @dimah-s3/core build
pnpm --filter @dimah-s3/core check-types
```

## Contribution workflow

1. Fork the repository and create a branch from `main`.
2. Make your changes with focused commits.
3. Add or update tests/docs where needed.
4. Add a Tegami changelog for user-facing package changes.
5. Open a Pull Request.

## Changelogs (required for package changes)

When your PR changes behavior, API, or package output, add a changelog:

```bash
pnpm tegami
```

Then choose the package(s) / `group:dimah-s3` and bump type:

- `patch`: bug fixes, small improvements, non-breaking behavior updates.
- `minor`: new backward-compatible features.
- `major`: breaking changes.

A changelog file is created in `.tegami/` and must be committed with your PR. CI comments a release preview on the PR.

## How to choose bump type (SemVer standard)

- Choose `patch` if consumers can upgrade safely without changing their code.
- Choose `minor` for additive features (new exports, new options with defaults, improved behavior).
- Choose `major` when existing consumer code may break or output contracts change.

## Pull Request checklist

- [ ] Build passes (`pnpm build`)
- [ ] Type checks pass (`pnpm check-types`)
- [ ] Lint passes (`pnpm lint`)
- [ ] Docs updated (if needed)
- [ ] Changelog added (if package behavior changed)

## Code of Conduct

By participating, you agree to follow [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).
