import { describe, expect, it } from "vitest";
import { FEATURE_HOOK_KEYS } from "./hook-registry";

describe("FEATURE_HOOK_KEYS", () => {
  it("is the merge contract for plugin hooks", () => {
    expect(FEATURE_HOOK_KEYS).toEqual({
      upload: ["presignGuard", "onPresigned", "confirmGuard", "onConfirmed"],
      download: ["presignGuard", "onPresigned"],
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
    });
  });
});
