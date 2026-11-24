---
packages:
  "@dimah-s3/share": minor
  "@dimah-s3/ui": minor
---

### Share link components

`ShareLinkDialog` and `SharedView` from `@dimah-s3/ui/share` are the owner's share dialog and the page a link opens, and `useShareLinks` from `@dimah-s3/share/react` is the hook under the dialog. [Share Link Dialog](https://s3.dimah.dev/docs/ui/components/share-link-dialog), [Shared View](https://s3.dimah.dev/docs/ui/components/shared-view).

- **`useShareLinks(api.share, target, options?)`.** The links of one object or folder in React state: `links`, `status`, `error`, `hasMore`, `loadMore`, `refresh`, `create`, `update`, and `revoke`.
- **`ShareLinkDialog`.** Creates a link with a lifetime from `expiryOptions`, an optional password, download limit, and note, and copies it; lists the target's links with their status, downloads, and views; changes them and turns them off. `linkUrl` builds a URL when `share()` has no `url`.
- **`shareTargetOf(entry, { bucket? })`.** The share target of an `ObjectList` row.
- **`SharedView`.** The password form, the shared file with its download, or the shared folder in a read-only `ObjectList`, a refusal message through `useFormatError`, and a header that counts the downloads left. Pass `link` from a server `openLink` to render at once.
- **`@dimah-s3/ui/share`.** A separate entry, so the main `@dimah-s3/ui` entry never imports `@dimah-s3/share`, which is an optional peer of `@dimah-s3/ui`. `react` is an optional peer of `@dimah-s3/share`, for the `/react` entry only.
- **Registry.** `npx shadcn@latest add @dimah-s3/share-link-dialog` and `@dimah-s3/shared-view`.
