---
packages:
  "@dimah-s3/react": major
---

### List entries stay put between renders

`useObjectList` keeps each entry object while its item or folder is the same object, so `entries`, and the selection maps built from them, keep their identity when a component renders again. An inline source no longer rebuilds them on every render.

#### Breaking changes

- **Keep `getKey` and `getFile` pure.** They run once per item object. A `getFile` that reads other state shows the old value until the item changes: replace the item with `setItems`, or reload.
