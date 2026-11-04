# Contributing

Thanks for your interest in contributing to this project.

## Prerequisites

- Node.js 24+ (see `.nvmrc`; CI uses Node 24)
- pnpm 12+

## Development setup

```bash
pnpm install
```

## Useful commands

```bash
pnpm build
pnpm check-types
pnpm lint
pnpm test
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

1. Branch from the line you are changing. `main` is stable 1.x. `v2` is the 2.0 beta.
2. Make your changes with focused commits.
3. Add or update tests/docs where needed.
4. Add a Tegami changelog for user-facing package changes.
5. Push that feature branch and open a pull request. Set the base to the line you branched from.

| Change   | Branch from | Pull request base | What ships                                                                                 |
| -------- | ----------- | ----------------- | ------------------------------------------------------------------------------------------ |
| 1.x fix  | `main`      | `main`            | next 1.x on npm `latest`, docs at [v1.s3.dimah.dev](https://v1.s3.dimah.dev/docs)             |
| 2.0 beta | `v2`        | `v2`              | next `2.0.0-beta.N` on npm `beta`, docs at [s3.dimah.dev](https://s3.dimah.dev/docs) |

`main` and `v2` only accept a squash merge through a pull request, after CI is green. Push the feature branch. The base dropdown on the pull request chooses `main` or `v2`. Do not merge `v2` into `main` locally. That merge is the stable 2.0.0 release, later.

A squash merge into `v2` publishes the beta when a changelog is pending. Until 2.0.0, every bump on `v2` stays `2.0.0-beta.N`, including breaking changes. A squash merge into `main` publishes the next 1.x on `latest`.

## Changelogs (required for package changes)

When your PR changes behavior, API, or package output, add a changelog:

```bash
pnpm tegami
```

Then choose the package(s) / `group:dimah-s3` and bump type:

- `patch`: bug fixes, small improvements, non-breaking behavior updates.
- `minor`: new backward-compatible features.
- `major`: breaking changes.

A changelog file is created in `.tegami/` and must be committed with your PR. CI comments a release preview on the PR. Dependency-only PRs still need a changelog when they change published package behavior or output.

## How to choose bump type (SemVer standard)

- Choose `patch` if consumers can upgrade safely without changing their code.
- Choose `minor` for additive features (new exports, new options with defaults, improved behavior).
- Choose `major` when existing consumer code may break or output contracts change.

## Pull Request checklist

- [ ] Build passes (`pnpm build`)
- [ ] Type checks pass (`pnpm check-types`)
- [ ] Lint passes (`pnpm lint`)
- [ ] Tests pass (`pnpm test`)
- [ ] Docs updated (if needed)
- [ ] Changelog added (if package behavior changed)

Security reports go through [GitHub private vulnerability reporting](https://github.com/dimah-kz/dimah-s3/security/advisories/new), not public issues. See [SECURITY.md](./SECURITY.md).

## Code of Conduct

By participating, you agree to follow [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).
