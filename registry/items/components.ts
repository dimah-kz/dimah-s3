import type { Registry } from "shadcn/schema";

/** Bundled with upload-button and upload-dropzone (not separate registry items). */
/** Paths are relative to `registry/dimah-s3-ui/` (see build-items output). */
const uploadSupportFiles = [
  {
    path: "components/upload/upload-status.tsx",
    type: "registry:component",
    target: "@components/upload/upload-status.tsx",
  },
  {
    path: "components/upload/multi-upload-status.tsx",
    type: "registry:component",
    target: "@components/upload/multi-upload-status.tsx",
  },
  {
    path: "components/upload/upload-status-block.tsx",
    type: "registry:component",
    target: "@components/upload/upload-status-block.tsx",
  },
  {
    path: "components/ui/circle-progress.tsx",
    type: "registry:ui",
    target: "@ui/circle-progress.tsx",
  },
  {
    path: "hooks/use-upload-toast.tsx",
    type: "registry:hook",
    target: "@hooks/use-upload-toast.tsx",
  },
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
    registryDependencies: [...toastRegistryDependencies, "progress"],
    files: [
      {
        path: "components/upload/upload-dropzone.tsx",
        type: "registry:component",
        target: "@components/upload/upload-dropzone.tsx",
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
    registryDependencies: [...toastRegistryDependencies, "tooltip", "progress"],
    files: [
      {
        path: "components/upload/upload-button.tsx",
        type: "registry:component",
        target: "@components/upload/upload-button.tsx",
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
    registryDependencies: toastRegistryDependencies,
    files: [
      {
        path: "components/download/download-button.tsx",
        type: "registry:component",
        target: "@components/download/download-button.tsx",
      },
      {
        path: "hooks/use-download-toast.tsx",
        type: "registry:hook",
        target: "@hooks/use-download-toast.tsx",
      },
    ],
  },
  {
    name: "progress-download-button",
    type: "registry:component",
    title: "Progress Download Button",
    description:
      "Download button with streaming progress bar and cancel support.",
    dependencies: [...componentDependencies],
    registryDependencies: [...toastRegistryDependencies, "tooltip"],
    files: [
      {
        path: "components/download/progress-download-button.tsx",
        type: "registry:component",
        target: "@components/download/progress-download-button.tsx",
      },
      {
        path: "hooks/use-download-toast.tsx",
        type: "registry:hook",
        target: "@hooks/use-download-toast.tsx",
      },
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
    ],
    files: [
      {
        path: "components/delete/delete-button.tsx",
        type: "registry:component",
        target: "@components/delete/delete-button.tsx",
      },
      {
        path: "hooks/use-delete-toast.tsx",
        type: "registry:hook",
        target: "@hooks/use-delete-toast.tsx",
      },
    ],
  },
] as const satisfies Registry["items"];
