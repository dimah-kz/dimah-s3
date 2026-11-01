# Architecture

Thin presign protocol, headless React hooks, optional shadcn UI. Consumers own the `S3Client`, auth, and quota numbers. Optional persistence is a server plugin from `@dimah-s3/db`.

## Package chain

```
@dimah-s3/core
        ↓
@dimah-s3/server | @dimah-s3/react  ←  @dimah-s3/ui  (peers: core + react)
        ↑
@dimah-s3/db  (peer: server — `db()` plugin)

@dimah-s3/cli  (scaffold only — no deps on the library chain)
```

`@dimah-s3/ui` peer-depends on both `@dimah-s3/core` and `@dimah-s3/react`, and `@dimah-s3/db` on `@dimah-s3/server`, each pinned to the exact release version. React does not re-export core. `@dimah-s3/db` has a type-only dev dependency on react to check that `dbObjectSource` fits `ObjectListSource`; it never imports react at runtime.

`apps/docs`, `apps/brand`, and `examples/*` consume workspace packages (not published). `templates/*` are standalone starters with published `@dimah-s3/*` ranges, snapshotted into the CLI at build time.

## Placement

Edit the **smallest package that owns the behavior**. Search that package before adding files.

| Package  | Owns                                                         |
| -------- | ------------------------------------------------------------ |
| `core`   | Protocol, `createS3Client`, error catalog, client plugins    |
| `server` | Presign HTTP, `dimahS3`, `route()`, server plugins, adapters |
| `react`  | Headless hooks (root) and plain functions (`/engine`)        |
| `ui`     | Optional components + registry source                        |
| `db`     | Optional persistence plugin                                  |
| `cli`    | `dimah-s3 create` only                                       |

Shared protocol changes start in `core`, then wire `server` and `react`. Do not copy a parallel schema or URL string into another package.

Product docs: `apps/docs/`. Shared ESLint / TSConfig / tsup / Vitest: `tooling/`. Registry item manifests: `packages/ui/scripts/` (see [registry.md](./registry.md)).

## Product shape

- Config is route-based: `dimahS3({ routes })`. Features are off until set on a route.
- The client sends a route name; the server generates and namespaces keys. Follow-up ops must stay inside that namespace.
- Uploads are stateless: presign and multipart init sign an upload ticket with the instance secret (`DIMAH_S3_SECRET`), and confirm and later multipart calls verify it. The server decides the multipart part layout and whether checksums are required.
- Server stays framework-agnostic. HTTP adapters live next to the existing ones under `packages/server/src/adapters/` — structural types, no framework peer deps.
- React is headless. The root entry is `"use client"`; `@dimah-s3/react/engine` holds the React-free functions and must stay importable from server modules.
- UI is composable families (`Upload*`, `Download*`, `Delete*`). The root takes the hook return as `upload` / `download` / `delete`; it does not call the hook. Toasts come only from the `*Toasts` components, one active owner per hook.

## Do not

- Put auth inside `@dimah-s3/server` or `@dimah-s3/core` — consumer `guard` hooks. Quota **checks** may live in `@dimah-s3/db`; the app still supplies the numbers.
- Import ORM / FumaDB from `server`.
- Import `ui` or `react` from `server` or `core`, or import `react` at runtime from `db`.
- Re-export `core` values from `react` or `ui` — consumers import them from `@dimah-s3/core`.
- Import React from `@dimah-s3/react/engine` or anything it pulls in (`pnpm check:dist` fails).
- Import Zod, or a schema, from anything the `@dimah-s3/core` root pulls in. Schemas belong to `@dimah-s3/core/schema` (`pnpm check:dist` fails).
- Hand-edit `packages/ui/registry.json` or `packages/ui/src/components/ui/` ([registry.md](./registry.md)).
- Wrap trivial S3 Copy / List / GetObject / tagging — `s3.put` and proxy `GET /file` are the exceptions.
