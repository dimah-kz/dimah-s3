import { describe, expect, it } from "vitest";
import { S3_ERROR_CODES } from "@dimah-s3/core";
import { createQuotaGuard } from "./create-quota-guard";
import { fakeStore, sampleObject } from "@/test/fakes";

const request = new Request("http://local");

describe("createQuotaGuard", () => {
  it("rejects when the file count cap is reached", async () => {
    const guard = createQuotaGuard({
      client: fakeStore({
        getScopeUsage: async () => ({ totalBytes: 0, objectCount: 2 }),
      }),
      resolveScope: async () => "user:1",
      maxFiles: 2,
    });

    await expect(guard({ request, file: { size: 1 } })).rejects.toMatchObject({
      code: S3_ERROR_CODES.QUOTA_EXCEEDED.code,
    });
  });

  it("allows overwrite when the file count cap is already reached", async () => {
    const guard = createQuotaGuard({
      client: fakeStore({
        getScopeUsage: async () => ({ totalBytes: 10, objectCount: 2 }),
      }),
      resolveScope: async () => "user:1",
      maxFiles: 2,
    });

    await expect(
      guard({ request, file: { size: 1 }, replace: "overwrite" }),
    ).resolves.toBeUndefined();
  });

  it("rejects when incoming bytes would exceed maxBytes", async () => {
    const guard = createQuotaGuard({
      client: fakeStore({
        getScopeUsage: async () => ({ totalBytes: 8, objectCount: 1 }),
      }),
      resolveScope: async () => "user:1",
      maxBytes: 10,
    });

    await expect(guard({ request, file: { size: 3 } })).rejects.toMatchObject({
      code: S3_ERROR_CODES.QUOTA_EXCEEDED.code,
    });
  });

  it("subtracts the replaced object size from byte usage", async () => {
    const guard = createQuotaGuard({
      client: fakeStore({
        getScopeUsage: async () => ({ totalBytes: 90, objectCount: 1 }),
        find: async () => sampleObject({ size: 20 }),
      }),
      resolveScope: async () => "user:1",
      maxBytes: 100,
    });

    await expect(
      guard({
        request,
        file: { size: 25 },
        replace: "overwrite",
        key: "k",
        bucket: "b",
      }),
    ).resolves.toBeUndefined();

    await expect(
      guard({
        request,
        file: { size: 40 },
        replace: "overwrite",
        key: "k",
        bucket: "b",
      }),
    ).rejects.toMatchObject({
      code: S3_ERROR_CODES.QUOTA_EXCEEDED.code,
    });
  });
});
