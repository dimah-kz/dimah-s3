/**
 * Single source of truth for which hook keys plugins may contribute per
 * feature. {@link applyPlugins} merges these ahead of user config hooks.
 */
export const FEATURE_HOOK_KEYS = {
  upload: ["guard", "onPresigned", "confirmGuard", "onConfirmed"],
  download: ["guard", "onPresigned"],
  delete: ["guard", "onDeleted"],
  multipart: [
    "initGuard",
    "partGuard",
    "completeGuard",
    "abortGuard",
    "listGuard",
    "onInit",
    "onComplete",
    "onAbort",
    "onList",
  ],
} as const;

export type FeatureName = keyof typeof FEATURE_HOOK_KEYS;
