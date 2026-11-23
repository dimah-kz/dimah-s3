---
packages:
  "@dimah-s3/server": major
---

### A plugin SDK with resolved routes, in-process calls, error codes, and a test kit

`definePlugin` gets what a third-party plugin needs to work like `db()`, without reaching into the config.

- **`env.routes`.** `init` receives every route as `dimahS3()` resolved it (`PluginRoute`): the client and bucket it inherits, its `keyPrefix`, which features are on, the upload file limits, and the plugin's own options.
- **`env.runOperation`.** Runs a plugin's in-process call the way `s3.api` runs one: every instance guard, then the route guard when the call names a route, then the call. Failures leave as an `APIError`, and an unexpected one is logged and passed to `onError`.
- **`plugin` in guard contexts.** Every plugin call, an endpoint or an in-process call, carries `plugin: { id, action }` (`PluginCall`). For an endpoint, `action` is its key in `endpoints`.
- **`$ERROR_CODES` on plugins.** Codes built with `defineErrorCodes` are merged into `s3.$ERROR_CODES`, with their types. A code the core catalog or another plugin already has throws at `dimahS3()`.
- **Typed route options.** `env.routeOptions(route)` and `env.routes[name].options` are typed by the plugin's `DimahS3RoutePluginOptions` augmentation, with no type argument.
- **Endpoint types.** `definePlugin` keeps the `endpoints` type, so a client plugin that names the server plugin gets a typed `$fetch`.
- **`assertStoredKey`.** `@dimah-s3/server/plugins` exports the check that a key sits inside a route's namespace.
- **`@dimah-s3/server/testing`.** `createTestInstance` runs an instance on an in-memory S3 with a browser client wired to its handler, and `upload` sends a file the way the browser does. `createMemoryS3`, `createTestClient`, and `uploadTestFile` are the parts. Node.js only.

#### Breaking changes

- **Put plugin endpoints under the plugin id.** A path is `/{id}` or `/{id}/…`; build it with `pluginPath(id, path)`. Any other path throws at `dimahS3()`.
- **Use a valid plugin id.** An id is a letter followed by up to 63 letters, digits, `_`, or `-`. `presign`, `file`, `routes`, and `delete` are reserved, next to the instance keys.
- **Compare `plugin.action` instead of `operation: "record"`.** `S3Operation` has no `"record"`: `s3.db.record` runs as `operation: "plugin"` with `plugin: { id: "db", action: "record" }`.
