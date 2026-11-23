# @dimah-s3/react

**1.x is no longer maintained.** Use [dimah-s3 2.0](https://s3.dimah.dev/docs) and the [upgrade guide](https://s3.dimah.dev/docs/migration-2-0).

Headless React hooks for S3 upload, download, and delete flows.

Full documentation: [v1.s3.dimah.dev/docs/react](https://v1.s3.dimah.dev/docs/react) ·
[llms.txt](https://v1.s3.dimah.dev/llms.txt)

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
