---
packages:
  "@dimah-s3/share": minor
  "@dimah-s3/ui": minor
---

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
