## @dimah-s3/share@2.3.0

### Change hooks get what the call loaded

The change hooks pass the rows their call already loaded, so an activity log or a search index no longer loads them again, and cannot race a concurrent move or delete. [Share API](https://s3.dimah.dev/docs/share/api#authorize-and-hooks), [change hooks](https://s3.dimah.dev/docs/db/lifecycle-hooks#change-hooks).

- **`share()` `onCreated`, `onUpdated`, `onRevoked`.** `ShareLinkEventContext` has `target`, the object or folder the link points at, as `onOpened` has. It is absent on an update or a revoke once that object or folder is gone.
- **`db()` `onObjectUpdated`.** `DbObjectUpdatedContext` has `folder`, the path of the folder the object was in (`null` at the root, absent once that folder is gone), and `destination` when the call named a `folderId`, with the shapes `authorize` sees.

### Share links take a lifetime

`createLink` and `updateLink` take `expiresIn`, the link's lifetime in whole seconds. The server adds it to its own clock and checks it against `expiration.max`, so a browser clock that runs ahead no longer makes the longest lifetime fail. [createLink input](https://s3.dimah.dev/docs/share/api#createlink-input).

- **`expiresIn`.** An integer of at least 1, on `shareClient()`, `s3.share.api`, and `POST` / `PATCH /share/link`. It is an alternative to `expiresAt`: sending both fails with `VALIDATION_ERROR`. `expiresAt: null` still means the link never expires.
- **`ShareLinkDialog`.** Sends the picked `expiryOptions` lifetime as `expiresIn`, so `expiration.max` can equal the longest option without a margin. Keep `@dimah-s3/share` and `@dimah-s3/ui` on the same version: an older `share()` refuses `expiresIn`.
- **Registry.** `share-link-dialog` and `shared-view` install `@dimah-s3/share@^2.3.0`.

### useFormatError words the share() rules

A link setting that breaks a `share()` rule still fails with `VALIDATION_ERROR`, and its `params` now name the rule, so `useFormatError` says what to change instead of "Invalid request". `ShareLinkDialog` shows it under the form. [Policy](https://s3.dimah.dev/docs/share/api#policy).

- **`params.rule`.** `passwordRequired`, `passwordTooShort` (with `minLength`), `expiryRequired`, `expiryInPast`, or `expiryTooLong` (with `maxExpiresIn`, in seconds). `params.issue` and the message are unchanged. The `VALIDATION_ERROR` entry of `S3ErrorParamsMap` types them.
- **`useFormatError`.** Words each rule, such as "Use at least 8 characters for the password" and "Choose an expiry of at most 7 days", under keys your `translations` can localize, such as `"Use at least {minLength} characters for the password(API error)"`. A `VALIDATION_ERROR` without a rule still reads "Invalid request".

## @dimah-s3/share@2.2.0

### Visitor calls can be refused per link and target

`share({ authorizeVisit })` lets your app refuse a visitor call on a link that still opens, such as one whose file or folder sits in your app's trash. [Authorize and hooks](https://s3.dimah.dev/docs/share/api#authorize-and-hooks).

- **`authorizeVisit(context)`.** Runs on `openLink` once the link is unlocked, and on `listShared`, `downloadShared`, and `sharedFile`, before anything is counted, listed, or sent. `false` fails the call with `SHARE_TARGET_UNAVAILABLE`, the same as a deleted target, and the link opens again once it returns `true`. It checks the call, not each row: a listing or search of a shared folder still names a hidden file or subfolder inside it, and opening or downloading that one is refused. A presigned URL handed out before it turned `false` works until it expires; a proxy URL stops at once.
- **`ShareVisitContext`.** `action`, `link`, `target`, `request`, `locals`, the `folder` the call lists or that holds the file, and the `object` it reaches: the file it sends, or the file of an object link on `openLink` and `listShared`.
- **`ShareVisitAction`.** The public actions that reach a target: every one but `unlockLink`.

### downloadSharedFile returns the download

`downloadSharedFile` from `@dimah-s3/share/client` resolves with the `downloadShared` response, so the shared page can show the new `downloadsLeft` without another `openLink`.

### useFormatError words the share codes

The `SHARE_*` codes are in the core catalog, so `useFormatError` turns them into messages your `translations` can localize, like every other code. [Errors](https://s3.dimah.dev/docs/share/api#errors).

- **`S3_ERROR_CODES`.** Adds `SHARE_LINK_NOT_FOUND`, `SHARE_LINK_EXPIRED`, `SHARE_LINK_REVOKED`, `SHARE_LINK_EXHAUSTED`, `SHARE_TARGET_UNAVAILABLE`, `SHARE_PASSWORD_REQUIRED`, `SHARE_PASSWORD_INVALID`, `SHARE_FOLDER_LINKS_DISABLED`, and `SHARE_DOWNLOAD_URL_INVALID`, with the statuses and messages they had.
- **`useFormatError`.** A message for each, and a translation key for each, such as `"This link has expired(API error)"`.
- **`SHARE_ERROR_CODES`.** Names the same core entries. `share()` and `shareClient()` no longer add their own `$ERROR_CODES`; the codes stay on `s3.$ERROR_CODES` and the client's through the core catalog. Keep every `@dimah-s3/*` package on the same version: an older `share()` next to this core fails at `dimahS3()` with a code the core catalog already defines.

### Share link components

`ShareLinkDialog` and `SharedView` from `@dimah-s3/ui/share` are the owner's share dialog and the page a link opens. Each takes a hook from `@dimah-s3/share/react`, as `ObjectList` takes `useObjectList`: `useShareLinks` for the dialog, `useShareVisit` for the page. [Share Link Dialog](https://s3.dimah.dev/docs/ui/components/share-link-dialog), [Shared View](https://s3.dimah.dev/docs/ui/components/shared-view), [hooks](https://s3.dimah.dev/docs/share/api#usesharelinks).

- **`useShareLinks(api.share, target, options?)`.** The links of one object or folder in React state, with the `useObjectList` status: `idle`, `loading`, `refreshing`, `loading-more`, `ready`, or `error`, and `isLoading`, `isRefreshing`, `isLoadingMore`. `error` is an `APIError`. `loadMore`, `refresh`, and `retry` never reject; a failed next page keeps the loaded links. `create`, `update`, and `revoke` reject with an `APIError`. A `null` target waits.
- **`useShareVisit(api.share, token, { link? })`.** The visitor's page: `status` is `loading`, `locked`, `ready`, or `error`, and tells `link` and `error` apart. `unlock(password)`, `download(id?)`, which updates `link.downloadsLeft`, `refresh()`, and `source`, a read-only `useObjectList` source with the password proof. A call that finds the link revoked, expired, out of downloads, or gone moves it to `error`; one whose proof expired moves it back to `locked`.
- **`ShareLinkDialog`.** Takes `links` from `useShareLinks`. Creates a link with a lifetime from `expiryOptions`, an optional password, download limit, and note, and copies it; lists the target's links with their URL, status, downloads, and views; changes them and turns them off after an alert dialog. `linkUrl` builds a URL when `share()` has no `url`. It loads again when it opens on a target it already loaded, and announces each creation, copy, change, and turned-off link in a live region.
- **`shareTargetOf(entry, { bucket? })`.** The share target of an `ObjectList` row.
- **`SharedView`.** Takes `visit` from `useShareVisit`. The password form, the shared file with its download, or the shared folder in a read-only `ObjectList`; a refusal message through `useFormatError`, with Try again after a network error; and a header that counts the downloads left.
- **Wire types.** `ShareVisitorLockedLink` and `ShareVisitorOpenLink` name the two kinds of `ShareVisitorLink`. `SHARE_PASSWORD_MAX_LENGTH` and `SHARE_LABEL_MAX_LENGTH` are exported from `@dimah-s3/share` and `@dimah-s3/share/client`.
- **`@dimah-s3/ui/share`.** A separate entry, so the main `@dimah-s3/ui` entry never imports `@dimah-s3/share`, which is an optional peer of `@dimah-s3/ui`. `react` is an optional peer of `@dimah-s3/share`, for the `/react` entry only.
- **Registry.** `npx shadcn@latest add @dimah-s3/share-link-dialog` and `@dimah-s3/shared-view`.

### listLinks shows authorize what it lists

`authorize` can tell a list of one file's or folder's links from a list of the whole scope, so a caller allowed to share in one folder no longer has to see every link of the scope. [Authorize and hooks](https://s3.dimah.dev/docs/share/api#authorize-and-hooks).

- **`target` on `listLinks`.** A list filtered by `key` or `folderId` passes the object or folder to `authorize` as `target`. Without `target`, the call lists every link of the scope.
- **db's `authorize`.** A filtered list runs it with the object or folder, as `createLink` does.
- **A filter that names nothing of the caller's.** No active object at the key, or no folder with the id, in the caller's scope lists nothing, without calling `authorize`.

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
