# examples/plugin-audit

A complete dimah-s3 plugin, shaped like a package you would publish. It records confirmed uploads, deletes, and (per route) presigned downloads, and serves them to the browser. Copy this folder to start your own plugin. The [Plugins](https://s3.dimah.dev/docs/server/plugins) guide explains each part.

It uses only the public plugin SDK, and CI builds and tests it, so it also checks that the SDK stays stable.

## Layout

| File                                     | What it shows                                                                                        |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| [src/index.ts](src/index.ts)             | `definePlugin`: hooks, an endpoint, route options, `$ERROR_CODES`, a context, and `env.runOperation` |
| [src/client.ts](src/client.ts)           | `defineClientPlugin` with `$InferServerPlugin`, so `$fetch` is typed by the server endpoint          |
| [src/error-codes.ts](src/error-codes.ts) | `defineErrorCodes`, shared by both entries                                                           |
| [src/store.ts](src/store.ts)             | A pluggable store, so the plugin ships no database                                                   |
| [src/audit.test.ts](src/audit.test.ts)   | `createTestInstance` from `@dimah-s3/server/testing`: uploads, the typed client, guards, error codes |

## Use it

```ts title="lib/s3.ts"
import { dimahS3, route } from "@dimah-s3/server";
import { audit } from "@acme/dimah-s3-audit";

export const s3 = dimahS3({
  client,
  bucket,
  plugins: [audit()],
  routes: {
    invoices: route({
      upload: true,
      download: true,
      plugins: { audit: { downloads: true } },
    }),
    avatars: route({ upload: true, plugins: { audit: false } }),
  },
});

await s3.audit.note(
  { route: "invoices", key, message: "Approved" },
  { headers: await headers() },
);
```

```ts title="lib/s3-client.ts"
import { createS3Client } from "@dimah-s3/react";
import { auditClient } from "@acme/dimah-s3-audit/client";

export const s3Client = createS3Client({ plugins: [auditClient()] });

const { events } = await s3Client.audit.listEvents({ route: "invoices" });
```

## Publish your own

- **Name.** `dimah-s3-<name>` or `@scope/dimah-s3-<name>`, with the npm keyword `dimah-s3-plugin`.
- **Entries.** `.` for the server plugin and `./client` for the client plugin. The client entry imports the server plugin as a type only.
- **Peers.** `@dimah-s3/server` and `@dimah-s3/core` as `peerDependencies` (`"^2.0.0"`), never `dependencies`, so the app has one copy. This example uses `workspace:*` dev dependencies instead, because it builds against the repository.
- **Ids.** The plugin id is also its path: every endpoint sits under `/{id}/`. Error codes start with the id in uppercase, such as `AUDIT_`.

```bash
pnpm build
pnpm test
```
