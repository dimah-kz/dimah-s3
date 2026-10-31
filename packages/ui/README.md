# @dimah-s3/ui

Optional prebuilt UI for `dimah-s3`, on top of `@dimah-s3/react` and
[shadcn/ui](https://ui.shadcn.com).

Full documentation: [s3.dimah.dev/docs/react/ui](https://s3.dimah.dev/docs/react/ui) ·
[llms.txt](https://s3.dimah.dev/llms.txt)

## Install

```bash
pnpm add @dimah-s3/ui @dimah-s3/core @dimah-s3/react @fuma-translate/react
```

Or copy items from the shadcn registry — see
[UI Setup](https://s3.dimah.dev/docs/react/ui).

## Styles

Import once in your CSS (Tailwind v4 source scan + shadcn color bridge):

```css
@import "@dimah-s3/ui/styles.css";
```

Colors default to your shadcn theme (`--primary`, `--muted`, …). To theme
the library alone, override the `--dimah-s3-<token>` variables on `:root` or
on any container:

```css
.uploads-panel {
  --dimah-s3-card: var(--muted);
}
```

The tokens are `background`, `foreground`, `card`, `card-foreground`,
`primary`, `primary-foreground`, `muted`, `muted-foreground`, `accent`,
`border`, `ring`, `destructive`, `success` and `warning`. `success` and
`warning` read your theme's `--success` / `--warning` when it defines them, and
fall back to a green and an amber otherwise. See
[Theming](https://s3.dimah.dev/docs/react/ui/customization/theming).

## Quick start

```tsx
import { createS3Client, useUpload } from "@dimah-s3/react";
import { Upload, UploadDropzone, UploadToasts } from "@dimah-s3/ui";

export const s3Client = createS3Client();

export function UploadDemo() {
  const upload = useUpload({ route: "uploads" });

  return (
    <s3Client.Provider>
      <Upload upload={upload}>
        <UploadDropzone />
      </Upload>
      <UploadToasts upload={upload} />
    </s3Client.Provider>
  );
}
```

Mount `<Toaster />` from `@dimah-s3/ui` next to `s3Client.Provider`.

## License

MIT
