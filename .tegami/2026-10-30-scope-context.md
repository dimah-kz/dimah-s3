---
packages:
  group:dimah-s3: minor
---

### Scope context for `resolveScope`

`db({ resolveScope })` receives a second argument: the `operation` (`"upload"`, `"confirm"`, `"multipart"`, `"download"`, `"delete"`, or `"list"`), the `route`, the object `key` the endpoint already validated, and on upload the client's `clientMetadata`. A scope that depends on the key no longer has to parse the request body or URL. A batch delete resolves once per key. One request calls the resolver once per operation and key, so presign no longer resolves the scope separately for the ownership guard, the quota guard, and `onPresigned`. A one-argument resolver keeps working.

`createObjectAccessGuard` now requires `operation`, which it passes to `resolveScope`. Create one guard per hook, such as `"download"` for `download.guard` and `"delete"` for `delete.guard`.
