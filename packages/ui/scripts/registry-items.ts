import type { Registry } from "shadcn/schema";

type RegistryItem = Registry["items"][number];
type RegistryFile = NonNullable<RegistryItem["files"]>[number];

/**
 * One source file of an item. `path` is relative to `packages/ui/src/`
 * (`@/` in source), and the target keeps it under the matching shadcn
 * placeholder (`@components/`, `@hooks/`, `@lib/`).
 */
function sourceFile(
  path: string,
  type: RegistryFile["type"] = "registry:component",
): RegistryFile {
  return { path, type, target: `@${path}` };
}

const circleProgressFile = sourceFile(
  "components/dimah-s3/attachment/circle-progress.tsx",
);

const attachmentFiles: RegistryFile[] = [
  sourceFile("components/dimah-s3/attachment/file-attachment.tsx"),
  sourceFile("components/dimah-s3/attachment/status-attachment.tsx"),
  circleProgressFile,
  sourceFile("components/dimah-s3/attachment/dismiss-attachment-action.tsx"),
  sourceFile("components/dimah-s3/attachment/file-type-glyph.tsx"),
  sourceFile("components/dimah-s3/attachment/folder-glyph.tsx"),
  sourceFile("lib/attachment-layout.ts", "registry:lib"),
];

const toastOwnerFile = sourceFile("hooks/use-toast-owner.ts", "registry:hook");

/** `Upload` reads the ObjectList context to upload into the open folder. */
const uploadRootFiles: RegistryFile[] = [
  sourceFile("components/dimah-s3/upload/upload.tsx"),
  sourceFile("components/dimah-s3/list/object-list-context.tsx"),
];

const uploadPartFiles: RegistryFile[] = [
  sourceFile("components/dimah-s3/upload/upload-trigger.tsx"),
  sourceFile("components/dimah-s3/upload/upload-dropzone.tsx"),
  sourceFile("components/dimah-s3/upload/upload-status.tsx"),
  sourceFile("components/dimah-s3/upload/upload-file-list.tsx"),
  sourceFile("components/dimah-s3/upload/upload-toasts.tsx"),
  sourceFile("hooks/use-paste-files.ts", "registry:hook"),
  sourceFile("hooks/use-own-drag.ts", "registry:hook"),
  sourceFile("lib/upload-hints.ts", "registry:lib"),
  sourceFile("lib/is-field-target.ts", "registry:lib"),
];

/** The whole upload family, with the attachments its status parts draw. */
const uploadFamilyFiles: RegistryFile[] = [
  ...uploadRootFiles,
  ...uploadPartFiles,
  ...attachmentFiles,
  toastOwnerFile,
];

const objectImageFile = sourceFile(
  "components/dimah-s3/preview/object-image.tsx",
);

const downloadFiles: RegistryFile[] = [
  sourceFile("components/dimah-s3/download/download.tsx"),
  sourceFile("components/dimah-s3/download/download-trigger.tsx"),
  sourceFile("components/dimah-s3/download/download-progress.tsx"),
  sourceFile("components/dimah-s3/download/download-toasts.tsx"),
];

const deleteFiles: RegistryFile[] = [
  sourceFile("components/dimah-s3/delete/delete.tsx"),
  sourceFile("components/dimah-s3/delete/delete-trigger.tsx"),
  sourceFile("components/dimah-s3/delete/delete-confirm-dialog.tsx"),
  sourceFile("components/dimah-s3/delete/delete-toasts.tsx"),
  sourceFile("lib/isolate-text.ts", "registry:lib"),
];

const objectListFiles: RegistryFile[] = [
  sourceFile("components/dimah-s3/list/object-list.tsx"),
  sourceFile("components/dimah-s3/list/object-list-header.tsx"),
  sourceFile("components/dimah-s3/list/object-list-breadcrumb.tsx"),
  sourceFile("components/dimah-s3/list/object-list-controls.tsx"),
  sourceFile("components/dimah-s3/list/object-list-content.tsx"),
  sourceFile("components/dimah-s3/list/object-list-entry.tsx"),
  sourceFile("components/dimah-s3/list/object-list-states.tsx"),
  sourceFile("components/dimah-s3/list/object-list-usage.tsx"),
  sourceFile("components/dimah-s3/list/object-list-upload.tsx"),
  sourceFile("components/dimah-s3/list/object-list-item-menu.tsx"),
  sourceFile("components/dimah-s3/list/object-list-feedback.tsx"),
  sourceFile(
    "components/dimah-s3/list/object-list-keyboard.ts",
    "registry:hook",
  ),
  sourceFile("lib/format-expires-in.ts", "registry:lib"),
];

const componentDependencies = [
  "@dimah-s3/core",
  "@dimah-s3/react",
  "@fuma-translate/react",
  "cn",
  "lucide-react",
] as const;

/** Theme tokens that `--dimah-s3-*` and the `*-dimah-s3-*` utilities cover. */
const themeTokens = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "primary",
  "primary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "border",
  "ring",
  "destructive",
  "success",
  "warning",
] as const;

type ThemeToken = (typeof themeTokens)[number];

/** Fallback colors for tokens that most shadcn themes do not define. */
const fallbacks = {
  light: {
    success: "oklch(0.627 0.194 149.214)",
    warning: "oklch(0.769 0.188 70.08)",
  },
  dark: {
    success: "oklch(0.723 0.219 149.579)",
    warning: "oklch(0.828 0.189 84.429)",
  },
} as const satisfies Record<
  "light" | "dark",
  Partial<Record<ThemeToken, string>>
>;

/** `--dimah-s3-<token>-default`: plain colors, so they inherit at any depth. */
function fallbackDefaults(
  mode: keyof typeof fallbacks,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(fallbacks[mode]).map(([token, color]) => [
      `dimah-s3-${token}-default`,
      color,
    ]),
  );
}

/** The token, then the shadcn variable, then the plain default if any. */
function tokenChain(token: ThemeToken): string {
  const shadcn =
    token in fallbacks.light
      ? `var(--${token}, var(--dimah-s3-${token}-default))`
      : `var(--${token})`;
  return `var(--dimah-s3-${token}, ${shadcn})`;
}

/**
 * The same tokens as `css/shadcn.css`. The `--dimah-s3-*` tokens are unset by
 * default: `theme` maps each `color-dimah-s3-*` utility (Tailwind v4
 * `@theme inline`) onto the token with the shadcn variable as its fallback,
 * so the chain resolves on the element that uses it and a nested `.dark` or
 * theme class reaches the components inside it. `light` and `dark` hold only
 * the plain `*-default` colors behind `success` and `warning`.
 */
export const componentCssVars = {
  light: fallbackDefaults("light"),
  dark: fallbackDefaults("dark"),
  theme: Object.fromEntries(
    themeTokens.map((token) => [`color-dimah-s3-${token}`, tokenChain(token)]),
  ),
} satisfies RegistryItem["cssVars"];

const toastRegistryDependencies = ["button", "toast"] as const;

const installMeta = {
  dependencies: [...componentDependencies],
  cssVars: componentCssVars,
};

/** For items that ship `attachment/file-type-glyph.tsx`. */
const glyphInstallMeta = {
  ...installMeta,
  dependencies: [...componentDependencies, "react-file-icon"],
  devDependencies: ["@types/react-file-icon"],
};

export const components: Registry["items"] = [
  {
    name: "file-attachment",
    type: "registry:component",
    title: "Attachment",
    description:
      "FileAttachment and StatusAttachment rows, file type and folder glyphs, and a progress ring for upload, download, and delete feedback.",
    ...glyphInstallMeta,
    // Stock shadcn Attachment primitive (not this item).
    registryDependencies: ["attachment"],
    files: [...attachmentFiles],
  },
  {
    name: "upload",
    type: "registry:component",
    title: "Upload",
    description:
      "Composable upload family: Upload root, trigger button, dropzone with the progress inside, status and file list as rows or a grid, paste, and toasts.",
    ...glyphInstallMeta,
    registryDependencies: [
      ...toastRegistryDependencies,
      "tooltip",
      "attachment",
      "progress",
    ],
    files: [...uploadFamilyFiles],
  },
  {
    name: "upload-field",
    type: "registry:component",
    title: "Upload Field",
    description:
      "Form field whose value is the keys of the files uploaded through it, with the upload family to fill it.",
    ...glyphInstallMeta,
    registryDependencies: [
      ...toastRegistryDependencies,
      "tooltip",
      "attachment",
      "progress",
    ],
    files: [
      sourceFile("components/dimah-s3/upload/upload-field.tsx"),
      ...uploadFamilyFiles,
    ],
  },
  {
    name: "avatar-upload",
    type: "registry:component",
    title: "Avatar Upload",
    description:
      "Round image button that uploads a new picture, with a preview, a progress ring, and live status.",
    ...installMeta,
    files: [
      sourceFile("components/dimah-s3/upload/avatar-upload.tsx"),
      ...uploadRootFiles,
      objectImageFile,
      circleProgressFile,
    ],
  },
  {
    name: "object-image",
    type: "registry:component",
    title: "Object Image",
    description:
      "Image that loads an S3 object through a presigned URL and refreshes it before it expires.",
    ...installMeta,
    dependencies: ["@dimah-s3/core", "@dimah-s3/react"],
    files: [objectImageFile],
  },
  {
    name: "download",
    type: "registry:component",
    title: "Download",
    description:
      "Composable download family: Download root, trigger button, progress, and toasts.",
    ...installMeta,
    registryDependencies: [...toastRegistryDependencies, "tooltip"],
    files: [...downloadFiles, toastOwnerFile],
  },
  {
    name: "delete",
    type: "registry:component",
    title: "Delete",
    description:
      "Composable delete family: Delete root with its confirm dialog, trigger button, and toasts.",
    ...installMeta,
    registryDependencies: [
      ...toastRegistryDependencies,
      "tooltip",
      "alert-dialog",
    ],
    files: [...deleteFiles, toastOwnerFile],
  },
  {
    name: "object-list",
    type: "registry:component",
    title: "Object List",
    description:
      "Composable file and folder browser: list and grid views, search, sort, folders, selection with bulk delete, drop upload, and a file menu.",
    ...glyphInstallMeta,
    registryDependencies: [
      "alert-dialog",
      "attachment",
      "breadcrumb",
      "button",
      "checkbox",
      "dropdown-menu",
      "empty",
      "progress",
      "skeleton",
      "spinner",
      "toast",
      "tooltip",
    ],
    files: [
      ...objectListFiles,
      ...uploadFamilyFiles,
      ...downloadFiles,
      ...deleteFiles,
    ],
  },
];
