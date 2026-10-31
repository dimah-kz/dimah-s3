import {
  AbortMultipartUploadCommand,
  CreateMultipartUploadCommand,
} from "@aws-sdk/client-s3";
import { buildContentDisposition, s3Error } from "@dimah-s3/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  defaultUploadBody,
  memoryS3,
  TEST_BUCKET,
  testConfig,
  testMultipart,
  testRoute,
  testUpload,
  type MemoryS3,
} from "@/test/harness";
import type { UploadGuardContext, UploadOnStartContext } from "@/types";
import type { ResolvedConfig, ResolvedUpload } from "@/types/resolved";
import { initMultipart } from "./init";

const MIB = 1024 * 1024;
const NOW = new Date("2026-01-01T00:00:00.000Z");

function setup(
  upload: Partial<ResolvedUpload> = {},
  config: Partial<ResolvedConfig> = {},
) {
  const s3 = memoryS3();
  const resolved = testConfig({
    routes: {
      uploads: testRoute({ client: s3.client, upload: testUpload(upload) }),
    },
    ...config,
  });
  return { s3, config: resolved };
}

function createInput(s3: MemoryS3) {
  const call = s3.send.mock.calls.find(
    ([command]) => command instanceof CreateMultipartUploadCommand,
  );
  return (call?.[0] as CreateMultipartUploadCommand | undefined)?.input;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("initMultipart", () => {
  it("creates the upload and returns the server part layout", async () => {
    const { s3, config } = setup();
    const result = await initMultipart(config, {
      ...defaultUploadBody,
      size: 20 * MIB,
    });

    expect(result).toEqual({
      key: expect.stringMatching(/^uploads\/.+\/a\.png$/),
      bucket: TEST_BUCKET,
      uploadId: "upload-1",
      ticket: expect.stringMatching(/^v1\./),
      partSize: 8 * MIB,
      partCount: 3,
      checksum: false,
    });
    const upload = s3.uploads.get("upload-1");
    expect(upload).toMatchObject({
      key: result.key,
      fields: {
        contentType: "image/png",
        contentDisposition: buildContentDisposition("a.png"),
        metadata: { "dimah-upload": expect.any(String) },
      },
    });
    expect(upload?.checksumAlgorithm).toBeUndefined();
    expect(createInput(s3)).toMatchObject({ ACL: "private" });
  });

  it("starts from the configured part size", async () => {
    const { config } = setup({
      multipart: testMultipart({ partSize: 16 * MIB }),
    });
    await expect(
      initMultipart(config, { ...defaultUploadBody, size: 20 * MIB }),
    ).resolves.toMatchObject({ partSize: 16 * MIB, partCount: 2 });
  });

  it("asks S3 for SHA-256 part checksums when the route requires them", async () => {
    const { s3, config } = setup({ checksum: true });
    await expect(
      initMultipart(config, defaultUploadBody),
    ).resolves.toMatchObject({ checksum: true, partCount: 1 });
    expect(s3.uploads.get("upload-1")?.checksumAlgorithm).toBe("SHA256");
  });

  it("writes object() metadata, storage class, cache control and tagging", async () => {
    const { s3, config } = setup({
      object: () => ({
        metadata: { source: "web" },
        storageClass: "STANDARD_IA",
        cacheControl: "max-age=3600",
        tagging: { env: "prod" },
      }),
    });
    await initMultipart(config, defaultUploadBody);

    expect(createInput(s3)).toMatchObject({
      StorageClass: "STANDARD_IA",
      CacheControl: "max-age=3600",
      Tagging: "env=prod",
      Metadata: { source: "web", "dimah-upload": expect.any(String) },
    });
  });

  it("runs upload.guard, then onStart with the upload id and ticket expiry", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const order: string[] = [];
    const guard = vi.fn<(context: UploadGuardContext) => void>(() => {
      order.push("guard");
    });
    const onStart = vi.fn<(context: UploadOnStartContext) => void>(() => {
      order.push("onStart");
    });
    const { s3, config } = setup({
      guard: [{ hook: guard }],
      onStart: [{ hook: onStart }],
      multipart: testMultipart({ ticketExpiresIn: 3600 }),
    });
    const result = await initMultipart(config, defaultUploadBody);

    expect(order).toEqual(["guard", "onStart"]);
    expect(guard.mock.calls[0][0]).toMatchObject({
      operation: "multipart.init",
      route: "uploads",
      kind: "multipart",
      key: result.key,
      file: { name: "a.png", size: 10, type: "image/png" },
    });
    const context = onStart.mock.calls[0][0];
    expect(context).toMatchObject({
      kind: "multipart",
      key: result.key,
      uploadId: "upload-1",
      uploadToken: s3.uploads.get("upload-1")?.fields.metadata["dimah-upload"],
      expiresAt: new Date(NOW.getTime() + 3600_000),
    });
    expect(context.url).toBeUndefined();
    expect(context.urlExpiresAt).toBeUndefined();
  });

  it("does not create the upload when upload.guard rejects", async () => {
    const { s3, config } = setup({
      guard: [
        {
          hook: () => {
            throw s3Error("FORBIDDEN");
          },
        },
      ],
    });
    await expect(
      initMultipart(config, defaultUploadBody),
    ).rejects.toMatchObject({ code: "FORBIDDEN", statusCode: 403 });
    expect(s3.send).not.toHaveBeenCalled();
  });

  it("aborts the upload when onStart throws", async () => {
    const { s3, config } = setup({
      onStart: [
        {
          hook: () => {
            throw new Error("persist failed");
          },
        },
      ],
    });
    await expect(
      initMultipart(config, defaultUploadBody),
    ).rejects.toMatchObject({ code: "INTERNAL_ERROR", statusCode: 500 });
    expect(s3.send).toHaveBeenCalledWith(
      expect.any(AbortMultipartUploadCommand),
    );
    expect(s3.uploads.size).toBe(0);
  });

  it("checks the declared file before S3 is called", async () => {
    const { s3, config } = setup({ maxFileSize: 5 });
    await expect(
      initMultipart(config, defaultUploadBody),
    ).rejects.toMatchObject({ code: "FILE_TOO_LARGE" });
    expect(s3.send).not.toHaveBeenCalled();
  });

  it("fails with FEATURE_DISABLED when multipart is off", async () => {
    const { s3, config } = setup({ multipart: { enabled: false } });
    await expect(
      initMultipart(config, defaultUploadBody),
    ).rejects.toMatchObject({ code: "FEATURE_DISABLED", statusCode: 404 });
    expect(s3.send).not.toHaveBeenCalled();
  });
});
