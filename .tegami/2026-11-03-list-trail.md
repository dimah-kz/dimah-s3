---
packages:
  "@dimah-s3/react": minor
---

### Breadcrumb from the list page

When the first page of `useObjectList` includes `trail`, the hook shows those folder names. A source that omits `trail` keeps the trail built while navigating. `dbObjectSource` sends the trail, so a deep link opens with the real names.
