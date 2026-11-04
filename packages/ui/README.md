# @dimah-s3/ui

**1.x.** New projects should use the [2.0 beta](https://s3.dimah.dev/docs/react/ui) (`npm i @dimah-s3/ui@beta`).

Optional prebuilt UI for `dimah-s3`, on top of `@dimah-s3/react` and
[shadcn/ui](https://ui.shadcn.com).

Full documentation: [v1.s3.dimah.dev/docs/react/ui](https://v1.s3.dimah.dev/docs/react/ui) ·
[llms.txt](https://v1.s3.dimah.dev/llms.txt)

## Install

```bash
pnpm add @dimah-s3/ui @dimah-s3/react shadcn
```

Or copy items from the shadcn registry — see
[UI Setup](https://v1.s3.dimah.dev/docs/react/ui).

## Styles

Import once in your CSS (Tailwind v4 source scan + shadcn color bridge):

```css
@import "@dimah-s3/ui/styles.css";
```

Colors default to your shadcn theme (`--primary`, `--muted`, …). Override
`--color-dimah-s3-*` to theme the library alone — see
[Theming](https://v1.s3.dimah.dev/docs/react/ui/customization/theming).

## Quick start

```tsx
import { createS3Client, useUpload } from "@dimah-s3/react";
import { UploadDropzone } from "@dimah-s3/ui";

export const s3Client = createS3Client();

export function UploadDemo() {
  const upload = useUpload({ route: "uploads" });

  return (
    <s3Client.Provider>
      <UploadDropzone upload={upload} />
    </s3Client.Provider>
  );
}
```

Mount `<Toaster />` from `@dimah-s3/ui` next to `s3Client.Provider`.

## License

MIT
