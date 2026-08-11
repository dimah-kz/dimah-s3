# @dimah-s3/react

Headless React hooks for S3 upload, download, and delete flows.

Full documentation: [dimah-s3.vercel.app](https://dimah-s3.vercel.app/docs/react)

## Install

```bash
pnpm add @dimah-s3/react
```

## Minimal setup

```tsx
import { createS3Client, useUpload } from "@dimah-s3/react";

export const { api, S3Provider, useApi } = createS3Client();

// App root
<S3Provider>{children}</S3Provider>;

// In a component
const { open, getInputProps } = useUpload({
  objectKey: (file) => `uploads/${file.name}`,
  noDrag: true,
  noClick: true,
  noKeyboard: true,
});
```

## License

MIT
