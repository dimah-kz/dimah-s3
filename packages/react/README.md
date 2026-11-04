# @dimah-s3/react

**2.0 beta.** Install with `@beta`. `@latest` stays on 1.x ([v1.s3.dimah.dev](https://v1.s3.dimah.dev/docs)), and betas can include breaking changes until 2.0.0.

Headless React hooks for S3 upload, download, and delete flows.

Full documentation: [s3.dimah.dev/docs/react](https://s3.dimah.dev/docs/react) ·
[llms.txt](https://s3.dimah.dev/llms.txt)

## Install

```bash
pnpm add @dimah-s3/react@beta @dimah-s3/core@beta @fuma-translate/react
```

Requires React 19.2.

## Minimal setup

Create the client once, in a client module:

```tsx
"use client";

import { createS3Client } from "@dimah-s3/react";

export const s3Client = createS3Client();
```

Wrap your app in `<s3Client.Provider>`. Then call a hook with a route name.
The server builds the object key:

```tsx
"use client";

import { useUpload } from "@dimah-s3/react";

export function AvatarPicker() {
  const upload = useUpload({ route: "avatar", accept: ["image/*"] });

  return (
    <>
      <input {...upload.getInputProps()} />
      <button
        type="button"
        disabled={upload.isPending}
        onClick={() => upload.open()}
      >
        {upload.isPending
          ? `Uploading ${upload.progress.percent}%`
          : "Upload avatar"}
      </button>
      {upload.error ? <p role="alert">{upload.error.message}</p> : null}
    </>
  );
}
```

## Entries

- `@dimah-s3/react`: the hooks (`useUpload`, `useDownload`,
  `useFetchDownload`, `useDelete`, `useObjectUrl`, `useObjectList`, …),
  `S3Provider`, `createS3Client`, and the types. It is a `"use client"`
  module.
- `@dimah-s3/react/engine`: plain functions with no React import, such as
  `uploadFile`, `memoryObjectSource`, `defineApi`, `loadRouteCatalog`, and
  `createLocalStorageStore`. Shared and server modules can import it.
- `APIError`, `S3_ERROR_CODES`, and the other protocol helpers come from
  `@dimah-s3/core`.

For prebuilt components, see [`@dimah-s3/ui`](https://s3.dimah.dev/docs/react/ui).

## License

MIT
