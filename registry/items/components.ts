import type { Registry } from "shadcn/schema";

/** Bundled with upload-button and upload-dropzone (not separate registry items). */
/** Paths are relative to `generated/dimah-s3-ui/` (see build-items output). */
const statusSupportFiles = [
  {
    path: "components/dimah-s3/status-attachment.tsx",
    type: "registry:component",
    target: "@components/dimah-s3/status-attachment.tsx",
  },
  {
    path: "lib/status-slot.ts",
    type: "registry:lib",
    target: "@lib/status-slot.ts",
  },
  {
    path: "lib/attachment-state.ts",
    type: "registry:lib",
    target: "@lib/attachment-state.ts",
  },
  {
    path: "lib/file-type-icon.ts",
    type: "registry:lib",
    target: "@lib/file-type-icon.ts",
  },
] as const satisfies Registry["items"][number]["files"];

const uploadSupportFiles = [
  {
    path: "components/dimah-s3/upload/upload-status.tsx",
    type: "registry:component",
    target: "@components/dimah-s3/upload/upload-status.tsx",
  },
  {
    path: "components/dimah-s3/upload/multi-upload-status.tsx",
    type: "registry:component",
    target: "@components/dimah-s3/upload/multi-upload-status.tsx",
  },
  {
    path: "components/dimah-s3/upload/upload-status-block.tsx",
    type: "registry:component",
    target: "@components/dimah-s3/upload/upload-status-block.tsx",
  },
  {
    path: "components/dimah-s3/file-attachment.tsx",
    type: "registry:component",
    target: "@components/dimah-s3/file-attachment.tsx",
  },
  {
    path: "components/dimah-s3/circle-progress.tsx",
    type: "registry:component",
    target: "@components/dimah-s3/circle-progress.tsx",
  },
  {
    path: "hooks/use-upload-toast.tsx",
    type: "registry:hook",
    target: "@hooks/use-upload-toast.tsx",
  },
  ...statusSupportFiles,
] as const satisfies Registry["items"][number]["files"];

const componentDependencies = [
  "@dimah-s3/core",
  "@dimah-s3/react",
  "lucide-react",
] as const;

const toastRegistryDependencies = ["button", "toast"] as const;

export const components = [
  {
    name: "upload-dropzone",
    type: "registry:component",
    title: "Upload Dropzone",
    description:
      "Drag-and-drop upload zone with inline status and toast support.",
    dependencies: [...componentDependencies],
    registryDependencies: [
      ...toastRegistryDependencies,
      "attachment",
      "progress",
    ],
    files: [
      {
        path: "components/dimah-s3/upload/upload-dropzone.tsx",
        type: "registry:component",
        target: "@components/dimah-s3/upload/upload-dropzone.tsx",
      },
      ...uploadSupportFiles,
    ],
  },
  {
    name: "upload-button",
    type: "registry:component",
    title: "Upload Button",
    description: "File upload button with inline status and toast support.",
    dependencies: [...componentDependencies],
    registryDependencies: [
      ...toastRegistryDependencies,
      "tooltip",
      "attachment",
      "progress",
    ],
    files: [
      {
        path: "components/dimah-s3/upload/upload-button.tsx",
        type: "registry:component",
        target: "@components/dimah-s3/upload/upload-button.tsx",
      },
      ...uploadSupportFiles,
    ],
  },
  {
    name: "download-button",
    type: "registry:component",
    title: "Download Button",
    description: "Presigned-URL download button with toast support.",
    dependencies: [...componentDependencies],
    registryDependencies: [...toastRegistryDependencies, "attachment"],
    files: [
      {
        path: "components/dimah-s3/download/download-button.tsx",
        type: "registry:component",
        target: "@components/dimah-s3/download/download-button.tsx",
      },
      {
        path: "hooks/use-download-toast.tsx",
        type: "registry:hook",
        target: "@hooks/use-download-toast.tsx",
      },
      ...statusSupportFiles,
    ],
  },
  {
    name: "progress-download-button",
    type: "registry:component",
    title: "Progress Download Button",
    description:
      "Download button with streaming progress bar and cancel support.",
    dependencies: [...componentDependencies],
    registryDependencies: [
      ...toastRegistryDependencies,
      "tooltip",
      "attachment",
    ],
    files: [
      {
        path: "components/dimah-s3/download/progress-download-button.tsx",
        type: "registry:component",
        target: "@components/dimah-s3/download/progress-download-button.tsx",
      },
      {
        path: "hooks/use-download-toast.tsx",
        type: "registry:hook",
        target: "@hooks/use-download-toast.tsx",
      },
      ...statusSupportFiles,
    ],
  },
  {
    name: "delete-button",
    type: "registry:component",
    title: "Delete Button",
    description:
      "S3 object delete button with confirmation dialog and toast support.",
    dependencies: [...componentDependencies],
    registryDependencies: [
      ...toastRegistryDependencies,
      "alert-dialog",
      "tooltip",
      "attachment",
    ],
    files: [
      {
        path: "components/dimah-s3/delete/delete-button.tsx",
        type: "registry:component",
        target: "@components/dimah-s3/delete/delete-button.tsx",
      },
      {
        path: "hooks/use-delete-toast.tsx",
        type: "registry:hook",
        target: "@hooks/use-delete-toast.tsx",
      },
      ...statusSupportFiles,
    ],
  },
] as const satisfies Registry["items"];
