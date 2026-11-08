# Contributing

Thanks for your interest in contributing to this project.

## Prerequisites

- Node.js 24+ (see `.node-version`; CI tests on Node 24 and 26)
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

1. Fork the repository and create a branch from `v2` for 2.0 beta work (docs at [s3.dimah.dev](https://s3.dimah.dev/docs)). Fixes for stable 1.x branch from `main` (docs at [v1.s3.dimah.dev](https://v1.s3.dimah.dev/docs)).
2. Make your changes with focused commits.
3. Add or update tests/docs where needed.
4. Add a Tegami changelog for user-facing package changes.
5. Open a Pull Request.

## Changelogs (required for package changes)

When your PR changes behavior, API, or package output, add a changelog:

```bash
pnpm tegami
```

Then choose the package(s) / `group:dimah-s3` and bump type. Write the note with [docs/agents/changelog.md](docs/agents/changelog.md).

- `patch`: bug fixes, small improvements, non-breaking behavior updates.
- `minor`: new backward-compatible features.
- `major`: breaking changes.

A changelog file is created in `.tegami/` and must be committed with your PR. CI comments a release preview on the PR. Dependency-only PRs still need a changelog when they change published package behavior or output.

## How to choose bump type (SemVer standard)

- Choose `patch` if consumers can upgrade safely without changing their code.
- Choose `minor` for additive features (new exports, new options with defaults, improved behavior).
- Choose `major` when existing consumer code may break or output contracts change.

## Continuous integration

Every pull request into `main` or `v2` runs [CI](.github/workflows/ci.yml). The branch rulesets require one check, **CI passed**, which fails when any other job fails or is cancelled. Pushes to `main` and `v2` run every job. Pull requests skip the smoke builds their changes cannot affect.

| Job                | Runs when                                                   | Reproduce locally                                                      |
| ------------------ | ----------------------------------------------------------- | ---------------------------------------------------------------------- |
| Lint & format      | Always                                                      | `pnpm lint`, `pnpm format:check`, `pnpm sherif`, `pnpm examples:drift` |
| Typecheck          | Always                                                      | `pnpm check-types`                                                     |
| Build              | Always                                                      | `pnpm build:packages && pnpm check:dist`                               |
| Test (Node 24, 26) | Always                                                      | `pnpm test`                                                            |
| Registry           | `packages/ui` or `registry.json` changed                    | `pnpm registry:validate`                                               |
| Example            | An example or a package it uses changed                     | `pnpm turbo run build --filter=./examples/with-nextjs`                 |
| Template           | A template, a package it uses, or a template script changed | `pnpm build:packages && pnpm templates:build -- --local nextjs`        |

Example builds need the placeholder S3 variables from the example's `.env.example` and a `DIMAH_S3_SECRET` of at least 32 characters. Template builds pack the workspace packages and install them into a temporary copy of the starter, so they test the code in your branch rather than the version on npm.

## Pull Request checklist

- [ ] Lint, type checks, and tests pass (`pnpm lint`, `pnpm check-types`, `pnpm test`)
- [ ] Tests cover the change
- [ ] Docs updated (if needed)
- [ ] Changelog added (if package behavior changed)

Security reports go through [GitHub private vulnerability reporting](https://github.com/dimah-kz/dimah-s3/security/advisories/new), not public issues. See [SECURITY.md](./SECURITY.md).

## Code of Conduct

By participating, you agree to follow [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).
