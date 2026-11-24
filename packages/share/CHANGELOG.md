## @dimah-s3/share@2.1.0

### Share links

`@dimah-s3/share` is a new plugin on top of `db()`. `share()` gives an owner links to one object or one folder of their scope, and anyone who holds a link can open it, list the folder, and download files without a session. Setup and the public page: [Share Links](https://s3.dimah.dev/docs/share).

- **Links.** `createLink`, `listLinks`, `getLink`, `updateLink`, and `revokeLink` on `api.share` (`shareClient()`) and `s3.share.api`. A link has an expiry, an optional password, an optional download limit, and a label, and reports its `status`, `downloadCount`, `viewCount`, and `lastAccessedAt`.
- **Visitors.** `openLink`, `unlockLink`, `listShared`, and `downloadShared` take the link `token`. A password is checked once and traded for an `access` proof. Downloads follow the route: a presigned URL, or a signed `/share/file` URL in proxy mode.
- **Policy.** `expiration: { default, max }`, `password: { required, minLength }`, `folders`, `downloadExpiresIn`, `unlockExpiresIn`, and `authorize`. db's `authorize` sees owner actions as `operation: "plugin"`.
- **Hooks.** `onCreated`, `onUpdated`, `onRevoked`, `onOpened`, and `onDownloaded`.
- **Guards.** `isSharePublicAction(context)` lets visitors through an instance guard that requires a session.
- **ObjectList.** `shareObjectSource()` lists a shared folder in `ObjectList`, and `downloadSharedFile()` downloads one file.
- **Server.** `s3.share.links` reads and revokes rows without guards, `s3.share.pruneLinks({ olderThan })` removes links revoked or expired before `olderThan` and links whose file or folder was deleted, and `s3.share.checkSchema()` fails fast.
- **Table.** One `share_link` table, schema `1.0.0`, generated with `runCli` from `@dimah-s3/share/cli` or created with `migrate(client)`.
- **Errors.** `SHARE_LINK_NOT_FOUND`, `SHARE_LINK_EXPIRED`, `SHARE_LINK_REVOKED`, `SHARE_LINK_EXHAUSTED`, `SHARE_TARGET_UNAVAILABLE`, `SHARE_PASSWORD_REQUIRED`, `SHARE_PASSWORD_INVALID`, `SHARE_FOLDER_LINKS_DISABLED`, and `SHARE_DOWNLOAD_URL_INVALID`.
