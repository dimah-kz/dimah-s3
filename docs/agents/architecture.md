# Architecture

Thin presign protocol, headless React hooks, optional shadcn UI. Consumers own the `S3Client`, auth, and quota numbers. Optional persistence is a server plugin from `@dimah-s3/db`.

## Package chain

```
@dimah-s3/core
        ↓
@dimah-s3/server | @dimah-s3/react  ←  @dimah-s3/ui
        ↑
@dimah-s3/db  (peer: server — `db()` plugin)

@dimah-s3/cli  (scaffold only — no deps on the library chain)
```

`apps/docs`, `apps/brand`, and `examples/*` consume workspace packages (not published). `templates/*` are standalone starters with published `@dimah-s3/*` ranges, snapshotted into the CLI at build time.

## Placement

Edit the **smallest package that owns the behavior**. Search that package before adding files.

| Package  | Owns                                                         |
| -------- | ------------------------------------------------------------ |
| `core`   | Protocol, `createS3Client`, errors, client plugins           |
| `server` | Presign HTTP, `dimahS3`, `route()`, server plugins, adapters |
| `react`  | Headless hooks                                               |
| `ui`     | Optional components + registry source                        |
| `db`     | Optional persistence plugin                                  |
| `cli`    | `dimah-s3 create` only                                       |

Shared protocol changes start in `core`, then wire `server` and `react`. Do not copy a parallel schema or URL string into another package.

Product docs: `apps/docs/`. Shared ESLint / TSConfig: `tooling/`. Registry item manifests: `packages/ui/scripts/` (see [registry.md](./registry.md)).

## Product shape

- Config is route-based: `dimahS3({ routes })`. Features are off until set on a route.
- The client sends a route name; the server generates and namespaces keys. Follow-up ops must stay inside that namespace.
- Server stays framework-agnostic. HTTP adapters live next to the existing ones under `packages/server/src/adapters/` — structural types, no framework peer deps.
- React is headless. Wired UI takes the hook return as `upload` / `download` / `delete`; it does not call the hook.

## Do not

- Put auth inside `@dimah-s3/server` or `@dimah-s3/core` — consumer `guard` hooks. Quota **checks** may live in `@dimah-s3/db`; the app still supplies the numbers.
- Import ORM / FumaDB from `server`.
- Import `ui` or `react` from `server` or `core`.
- Hand-edit `packages/ui/registry.json` or `packages/ui/src/components/ui/` ([registry.md](./registry.md)).
- Wrap trivial S3 Copy / List / GetObject / tagging — `s3.put` and proxy `GET /file` are the exceptions.
