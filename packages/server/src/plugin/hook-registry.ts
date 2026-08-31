/**
 * Single source of truth for which hook keys plugins may contribute per
 * feature. {@link applyPlugins} merges these ahead of user config hooks.
 */
export const FEATURE_HOOK_KEYS = {
  upload: ["guard", "onPresigned", "confirmGuard", "onConfirmed"],
  download: ["guard", "onPresigned"],
  delete: ["guard", "onDeleted"],
} as const;

/** Nested under `upload.multipart` — init/complete share upload hooks. */
export const MULTIPART_HOOK_KEYS = [
  "onInit",
  "guard",
  "onAbort",
  "onList",
] as const;

export type FeatureName = keyof typeof FEATURE_HOOK_KEYS;
