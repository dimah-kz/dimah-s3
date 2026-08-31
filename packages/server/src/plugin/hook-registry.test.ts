import { describe, expect, it } from "vitest";
import {
  FEATURE_HOOK_KEYS,
  MULTIPART_HOOK_KEYS,
  LIFECYCLE_FEATURE_HOOK_KEYS,
  LIFECYCLE_MULTIPART_HOOK_KEYS,
} from "./hook-registry";

describe("FEATURE_HOOK_KEYS", () => {
  it("is the merge contract for plugin hooks", () => {
    expect(FEATURE_HOOK_KEYS).toEqual({
      upload: ["guard", "onPresigned", "confirmGuard", "onConfirmed"],
      download: ["guard", "onPresigned"],
      delete: ["guard", "onDeleted"],
    });
    expect(MULTIPART_HOOK_KEYS).toEqual([
      "onInit",
      "guard",
      "onAbort",
      "onList",
    ]);
    expect(LIFECYCLE_FEATURE_HOOK_KEYS).toEqual({
      upload: ["onPresigned", "onConfirmed"],
      download: ["onPresigned"],
      delete: ["onDeleted"],
    });
    expect(LIFECYCLE_MULTIPART_HOOK_KEYS).toEqual([
      "onInit",
      "onAbort",
      "onList",
    ]);
  });
});
