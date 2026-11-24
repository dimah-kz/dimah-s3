---
packages:
  "@dimah-s3/ui": patch
---

### ObjectList draws stock shadcn primitives

`ObjectList` builds on the shadcn primitives instead of its own markup. Its border colors stay `dimah-s3` tokens.

- **Move dialog.** The shadcn `Dialog`, and its folder path the shadcn `Breadcrumb`.
- **Fields.** Search, and the wide new folder field, are a shadcn `InputGroup` with their icon and buttons inside it; a rename in a row is one too, with Cancel inside. The other fields are the shadcn `Input`, labelled with `Label`.
- **Search in.** The choice between the open folder and every folder is a shadcn `ToggleGroup`: two toggle buttons with `aria-pressed`, where it was a `radiogroup`. Arrow keys move focus; Enter or Space picks.
- **Registry.** `npx shadcn@latest add @dimah-s3/object-list` also installs `dialog`, `input`, `input-group`, `label`, and `toggle-group`, and no longer lists `@base-ui/react` itself: the primitives bring it.
- **Dark mode.** The fields take the stock input background, `dark:bg-input/30`.
