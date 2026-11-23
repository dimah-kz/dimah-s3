# @dimah-s3/ui

Optional prebuilt UI for `dimah-s3`, on top of `@dimah-s3/react` and
[shadcn/ui](https://ui.shadcn.com).

Full documentation: [s3.dimah.dev/docs/ui](https://s3.dimah.dev/docs/ui) ·
[llms.txt](https://s3.dimah.dev/llms.txt)

## Install

```bash
pnpm add @dimah-s3/ui @dimah-s3/core @dimah-s3/react @fuma-translate/react @base-ui/react class-variance-authority cn lucide-react
```

Requires React 19.2 and Tailwind CSS v4. Every package on that line is a
peer dependency: `@dimah-s3/core` and `@dimah-s3/react` at the same version
as `@dimah-s3/ui`, and the rest are what the bundled shadcn primitives
import.

Or copy items from the shadcn registry — see
[UI Setup](https://s3.dimah.dev/docs/ui). Registry items need a shadcn
project on a [Base UI](https://base-ui.com) style: the copied source uses
your project's own `button`, `tooltip`, `dropdown-menu` and other primitives
through Base UI props such as `render`. The npm package bundles its
primitives, so it works in any project.

## Styles

The components are styled with Tailwind v4 utilities and shadcn theme
variables. Import the stylesheet once, after Tailwind and the two packages
the primitives animate with:

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";
@import "@dimah-s3/ui/styles.css";
```

`@dimah-s3/ui/styles.css` registers the package with Tailwind's source scan
and maps its colors onto your theme. It adds no animations of its own:
`tw-animate-css` animates the menus, dialogs and tooltips, and
`shadcn/tailwind.css` has the `shimmer` utility of loading text. Install
both (`pnpm add -D tw-animate-css shadcn`).

Colors come from the shadcn theme variables that `shadcn init` writes
(`--background`, `--foreground`, `--card`, `--popover`, `--primary`,
`--muted`, `--border`, `--ring`, `--destructive`, …), so define them. To theme
the library alone, override the `--dimah-s3-<token>` variables on `:root` or
on any container:

```css
.uploads-panel {
  --dimah-s3-card: var(--muted);
}
```

The tokens are `background`, `foreground`, `card`, `card-foreground`,
`primary`, `muted`, `muted-foreground`, `border`, `ring`, `destructive`,
`success` and `warning`. `success` and
`warning` read your theme's `--success` / `--warning` when it defines them, and
fall back to a green and an amber otherwise. See
[Theming](https://s3.dimah.dev/docs/ui/theming).

## Quick start

Mount one `<Toaster />` inside your S3 provider. `s3Client` is the
`createS3Client()` from `@dimah-s3/react`:

```tsx
"use client";

import type { ReactNode } from "react";
import { Toaster } from "@dimah-s3/ui";
import { s3Client } from "@/lib/s3-client";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <s3Client.Provider>
      {children}
      <Toaster />
    </s3Client.Provider>
  );
}
```

Then compose a family around a hook, anywhere inside the provider:

```tsx
"use client";

import { useUpload } from "@dimah-s3/react";
import { Upload, UploadDropzone, UploadToasts } from "@dimah-s3/ui";

export function Uploader() {
  const upload = useUpload({ route: "uploads", maxFiles: 5 });

  return (
    <>
      <Upload upload={upload}>
        {/* Progress shows inside the dropzone. */}
        <UploadDropzone />
      </Upload>
      <UploadToasts upload={upload} />
    </>
  );
}
```

## Components

- `Upload` holds a `useUpload` return for `UploadTrigger`, `UploadDropzone`,
  `UploadStatus`, and `UploadFileList`. The dropzone shows the status inside
  it unless you arrange its parts yourself.
- `Download` holds a `useDownload` or `useFetchDownload` return for
  `DownloadTrigger` and `DownloadProgress`.
- `Delete` holds a `useDelete` return and one confirm dialog for every
  `DeleteTrigger` inside it.
- `ObjectCard` shows a stored file with download and delete actions.
- `UploadField` submits uploaded keys with a form. `AvatarUpload` uploads
  and shows a profile image. `ObjectImage` shows a stored image.
- `ObjectList` and its parts render a `useObjectList` file browser.

Components do not toast on their own. Mount `UploadToasts`, `DownloadToasts`,
or `DeleteToasts` once per hook. A second one for the same hook renders
nothing.

## License

MIT
