---
packages:
  "@dimah-s3/db": major
---

### db() on the plugin SDK

`db()` reads the resolved routes and runs `s3.db.record` through the plugin SDK, so every guard applies to it.

- **`s3.db.record` runs every guard.** Every plugin's instance guard runs, then the user's instance guard and the route guard. A guard another plugin adds, such as auth or a rate limit, now applies to it.
- **`s3.db.record` fails with an `APIError`.** An unexpected failure is logged, passed to `onError`, and becomes `500 INTERNAL_ERROR`, as from `s3.api`.
- **Guards name the db action.** A `/db/*` call carries `plugin: { id: "db", action }`, where `action` is the `dbClient()` method: `listObjects`, `getObject`, `updateObject`, `createFolder`, `updateFolder`, or `deleteFolder`.
- **`dbClient()` is typed by `db()`.** Its responses come from the endpoint types, so the client and the server stay in step.

#### Breaking changes

- **Compare `plugin.action` in guards.** The instance and route guards no longer receive `operation: "record"` from `s3.db.record`: they receive `operation: "plugin"` with `plugin.action === "record"`.
