---
packages:
  "@dimah-s3/share": minor
---

### Filter share links by status

`listLinks`, `s3.share.links.list` and `count`, and `useShareLinks` take `status`, so an owner screen can show or count the links that still open without a query of its own on `share_link`. [listLinks](https://s3.dimah.dev/docs/share/api#createlink-input).

- **`status`.** `active`, `expired`, `exhausted`, or `revoked`, or an array of them. The database tells them apart at the time of the call, the same way `shareLinkStatus` does: revoked wins over expired, and expired over exhausted. It takes precedence over `includeRevoked`, which keeps its meaning.
- **`GET /share/links`.** Takes `status` as one value or a comma-separated list. An unknown status fails with `VALIDATION_ERROR`.
- **`useShareLinks(api.share, target, { status })`.** Lists only those statuses. A create, change, or revoke that moves a link out of them takes it out of `links`, so a list of active links drops a link once it is turned off or reaches its limit.
