---
packages:
  "@dimah-s3/ui": patch
---

### ObjectList draws stock shadcn primitives

The `ObjectList` Move dialog is the shadcn `Dialog`, and its rename, new folder, and search fields are the shadcn `Input` and `Label`. They keep their `dimah-s3` colors and layout.

- **Registry.** `npx shadcn@latest add @dimah-s3/object-list` also installs the `dialog`, `input`, and `label` primitives, and no longer lists `@base-ui/react` itself: the primitives bring it.
- **Dark mode.** The fields take the stock input background, `dark:bg-input/30`.
