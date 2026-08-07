# @dimah-s3/ui

Optional prebuilt UI components for `dimah-s3`, powered by `@dimah-s3/react`.

Full documentation: [dimah-s3.vercel.app](https://dimah-s3.vercel.app/docs/react/ui/upload-button)

## Install

```bash
pnpm add @dimah-s3/ui @dimah-s3/react
```

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
