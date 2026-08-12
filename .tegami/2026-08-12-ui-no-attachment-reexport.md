---
packages:
  group:dimah-s3: major
---

### Stop re-exporting stock shadcn Attachment primitives

`Attachment`, `AttachmentMedia`, and the other stock shadcn Attachment pieces
are no longer exported from `@dimah-s3/ui`. Add them in your app with
`npx shadcn@latest add attachment` (or use the copies that land with registry
items). Dimah-owned rows stay available as `FileAttachment` and
`StatusAttachment`.
