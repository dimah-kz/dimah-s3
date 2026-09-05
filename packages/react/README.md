# @dimah-s3/react

Headless React hooks for S3 upload, download, and delete flows.

Full documentation: [s3.dimah.dev/docs/react](https://s3.dimah.dev/docs/react) ·
[llms.txt](https://s3.dimah.dev/llms.txt)

## Install

```bash
pnpm add @dimah-s3/react
```

## Minimal setup

```tsx
import { createS3Client, useUpload } from "@dimah-s3/react";

export const s3Client = createS3Client();

// App root
<s3Client.Provider>{children}</s3Client.Provider>;

// In a component
const { open, getInputProps } = useUpload({
  route: "uploads",
  noDrag: true,
  noClick: true,
  noKeyboard: true,
});
```

## License

MIT
