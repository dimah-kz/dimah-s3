# @dimah-s3/ui

Optional prebuilt UI components for `dimah-s3`, powered by `@dimah-s3/react`.

Full documentation: [dimah-s3.vercel.app](https://dimah-s3.vercel.app/docs/react/ui/setup)

## Install

```bash
pnpm add @dimah-s3/ui @dimah-s3/react
```

## Styles

Import once in your CSS (Tailwind v4 source scan + shadcn color bridge):

```css
@import "@dimah-s3/ui/styles.css";
```

Colors default to your shadcn theme (`--primary`, `--muted`, …). Override
`--color-dimah-s3-*` to theme the library alone — see
[Theming](https://dimah-s3.vercel.app/docs/react/ui/customization/theming).

## Quick start

```tsx
import { createS3Client } from "@dimah-s3/react";
import { UploadButton, UploadDropzone } from "@dimah-s3/ui";

export const { api, S3Provider } = createS3Client();

export function UploadDemo() {
  return <UploadDropzone objectKey={(file) => `uploads/${file.name}`} />;
}
```

## License

MIT
