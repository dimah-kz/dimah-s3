import { describe, expect, it, vi } from "vitest";
import type { DbUsage } from "@/types/client";
import { createQuota } from "./quota";
import type { ResolvedScope } from "./scope";

const scope: ResolvedScope = {
  request: new Request("http://localhost/"),
  locals: {},
  session: undefined,
  operation: "upload",
  scope: "user:1",
};

const excluding = { bucket: "b", key: "k" };

function usage(value: DbUsage) {
  return { getUsage: vi.fn(async () => value) };
}

describe("createQuota", () => {
  it("rejects one more file at the file cap", async () => {
    const quota = createQuota(usage({ totalBytes: 0, objectCount: 2 }), {
      maxFiles: 2,
    });

    await expect(
      quota.assert(scope, { size: 1, excluding }),
    ).rejects.toMatchObject({
      code: "QUOTA_EXCEEDED",
      statusCode: 403,
      params: { limit: "files" },
    });
  });

  it("rejects bytes past the byte cap", async () => {
    const quota = createQuota(usage({ totalBytes: 8, objectCount: 1 }), {
      maxBytes: 10,
    });

    await expect(
      quota.assert(scope, { size: 2, excluding }),
    ).resolves.toBeUndefined();
    await expect(
      quota.assert(scope, { size: 3, excluding }),
    ).rejects.toMatchObject({
      code: "QUOTA_EXCEEDED",
      params: { limit: "bytes" },
    });
  });

  it("leaves the written row out of the usage", async () => {
    const objects = usage({ totalBytes: 0, objectCount: 0 });
    const quota = createQuota(objects, { maxBytes: 10 });

    await quota.assert(scope, { size: 1, excluding });
    expect(objects.getUsage).toHaveBeenCalledWith("user:1", { excluding });
  });

  it("reads caps per scope from a function", async () => {
    const option = vi.fn(({ scope: id }: ResolvedScope) =>
      id === "user:1" ? { maxFiles: 1 } : null,
    );
    const quota = createQuota(usage({ totalBytes: 0, objectCount: 1 }), option);

    await expect(quota.limits(scope)).resolves.toEqual({ maxFiles: 1 });
    await expect(
      quota.assert(scope, { size: 1, excluding }),
    ).rejects.toMatchObject({ code: "QUOTA_EXCEEDED" });
    await expect(
      quota.assert({ ...scope, scope: "user:2" }, { size: 1, excluding }),
    ).resolves.toBeUndefined();
    expect(option).toHaveBeenCalledWith(scope);
  });

  it("skips the usage query without caps", async () => {
    const objects = usage({ totalBytes: 100, objectCount: 100 });

    await createQuota(objects, undefined).assert(scope, { size: 1, excluding });
    await createQuota(objects, {}).assert(scope, { size: 1, excluding });
    await expect(
      createQuota(objects, undefined).limits(scope),
    ).resolves.toBeNull();
    expect(objects.getUsage).not.toHaveBeenCalled();
  });
});
