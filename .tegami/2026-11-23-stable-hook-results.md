---
packages:
  "@dimah-s3/react": minor
---

### Hook results keep their identity

The objects that `useUpload`, `useDownload`, `useFetchDownload`, `useDelete`, `useObjectUrl`, `useObjectList`, `useObjectListSelection`, and `useRouteUploadPolicy` return stay the same object until a value in them changes, so they can go in effect dependencies and context values.

- **`upload.policy`** stays the same object while the route policy is the same, also when `accept` is a new array on every render.
- **`upload.getRootProps`, `getInputProps`, and `getDropTargetProps`** keep their identity while the policy and the hook options do.
- **`useObjectList`** keeps its result while the source functions you pass keep theirs.
