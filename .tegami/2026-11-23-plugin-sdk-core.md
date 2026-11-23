---
packages:
  "@dimah-s3/core":
    replay:
      - exit-prerelease(npm:@dimah-s3/core)
---

### Typed client plugins and plugin error codes

A client plugin reads its types from the server plugin, and plugins define error codes the same way the core catalog does.

- **Typed `$fetch`.** With `$InferServerPlugin`, the `$fetch` that `getActions` receives is typed by the server plugin's endpoints: the path and method pick one, its schema types `query` and `body`, and the result is its handler's return type (`S3PluginFetch`, `S3EndpointFetch`). A path, method, or body the server does not accept fails to compile.
- **`$ERROR_CODES` on client plugins.** Merged into the client's `$ERROR_CODES`, with their types. A code that is already there throws at `createS3Client()`.
- **`s3Error(entry, params)` and `isS3ErrorCode(error, entry)`.** Both take an entry of any `defineErrorCodes` catalog, besides a core code. `params` are typed by the message's `{placeholders}` (`S3ErrorEntryParams`).
- **`pluginPath` keeps the literal path** (`PluginPath`), so a typed `$fetch` matches it.
- **`S3ErrorCatalog` and `S3ErrorCodeEntry`** type a catalog and one of its entries.

#### Breaking changes

- **Drop the type argument from a typed `$fetch`.** With `$InferServerPlugin` set, `$fetch<T>(path, options)` does not compile. Call `$fetch(path, options)`: the result has the endpoint's type.
- **Build valid codes with `defineErrorCodes`.** It throws for a code that is not uppercase snake case, a status outside 100–599, or an empty message.
