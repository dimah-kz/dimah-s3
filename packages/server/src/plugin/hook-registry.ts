import type {
  DeleteConfig,
  DownloadConfig,
  MultipartConfig,
  RouteFeature,
  UploadConfig,
} from "@/types/config";

/**
 * Hook keys a plugin may contribute per route feature.
 * {@link applyPlugins} merges these ahead of user config hooks.
 */
export const FEATURE_HOOK_KEYS = {
  upload: ["guard", "onPresigned", "confirmGuard", "onConfirmed"],
  download: ["guard", "onPresigned"],
  delete: ["guard", "onDeleted"],
} as const satisfies {
  [K in RouteFeature]: readonly (keyof (K extends "upload"
    ? UploadConfig
    : K extends "download"
      ? DownloadConfig
      : DeleteConfig))[];
};

/** Nested under `upload.multipart` — init/complete share upload hooks. */
export const MULTIPART_HOOK_KEYS = [
  "onInit",
  "guard",
  "onAbort",
  "onList",
] as const satisfies readonly (keyof MultipartConfig)[];

/** Lifecycle `on*` keys — merged user-first, plugins last (persist last). */
export const LIFECYCLE_FEATURE_HOOK_KEYS = {
  upload: ["onPresigned", "onConfirmed"],
  download: ["onPresigned"],
  delete: ["onDeleted"],
} as const;

export const LIFECYCLE_MULTIPART_HOOK_KEYS = [
  "onInit",
  "onAbort",
  "onList",
] as const;

export type FeatureHookKeyMap = typeof FEATURE_HOOK_KEYS;
export type MultipartHookKey = (typeof MULTIPART_HOOK_KEYS)[number];
