---
packages:
  group:dimah-s3:
    replay:
      - exit-prerelease(npm:@dimah-s3/cli)
      - exit-prerelease(npm:@dimah-s3/core)
      - exit-prerelease(npm:@dimah-s3/db)
      - exit-prerelease(npm:@dimah-s3/react)
      - exit-prerelease(npm:@dimah-s3/server)
      - exit-prerelease(npm:@dimah-s3/ui)
---

### A plugin SDK for third-party plugins

Plugins get resolved routes, in-process calls behind the guards, their own error codes, a client typed by the server, and a test kit. Each package changelog lists its own changes. The [Plugins](https://s3.dimah.dev/docs/server/plugins) guide builds one end to end, and [Testing](https://s3.dimah.dev/docs/server/testing) covers `@dimah-s3/server/testing`. The [upgrade guide](https://s3.dimah.dev/docs/migration-2-0#update-plugins) lists what a plugin written for an earlier beta changes.
