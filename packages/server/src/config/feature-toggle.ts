import type { FeatureToggle } from "@/types/config";

/** Whether a resolved feature is on. Narrows to the enabled shape. */
export function isEnabled<T extends { enabled: boolean }>(
  feature: T,
): feature is T & { enabled: true } {
  return feature.enabled;
}

/**
 * Whether a feature toggle is on: `true` or an options object is on, and
 * `false` is off. `undefined` uses `defaultOn`. A resolved `{ enabled }`
 * object uses its flag.
 */
export function isFeatureOn<T extends object>(
  value: FeatureToggle<T> | { enabled: boolean } | undefined,
  defaultOn = false,
): boolean {
  if (value === undefined) return defaultOn;
  if (typeof value === "boolean") return value;
  if ("enabled" in value && typeof value.enabled === "boolean") {
    return value.enabled;
  }
  return true;
}
