import { AbortMultipartUploadCommand } from "@aws-sdk/client-s3";
import { s3Error } from "@dimah-s3/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  defaultUploadBody,
  memoryS3,
  TEST_BUCKET,
  testConfig,
  testMultipart,
  testRoute,
  testUpload,
} from "@/test/harness";
import type { MultipartGuardContext, MultipartOnAbortContext } from "@/types";
import type { ResolvedMultipart } from "@/types/resolved";
import { abortMultipart } from "./abort";
import { completeMultipart } from "./complete";
import { initMultipart } from "./init";

const NOW = new Date("2026-01-01T00:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

function setup(multipart: Partial<ResolvedMultipart> = {}) {
  const s3 = memoryS3();
  const config = testConfig({
    routes: {
      uploads: testRoute({
        client: s3.client,
        upload: testUpload({ multipart: testMultipart(multipart) }),
      }),
    },
  });
  return { s3, config };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("abortMultipart", () => {
  it("aborts the upload, then runs onAbort", async () => {
    const order: string[] = [];
    const guard = vi.fn<(context: MultipartGuardContext) => void>(() => {
      order.push("guard");
    });
    const onAbort = vi.fn<(context: MultipartOnAbortContext) => void>(() => {
      order.push("onAbort");
    });
    const { s3, config } = setup({
      guard: [{ hook: guard }],
      onAbort: [{ hook: onAbort }],
    });
    const upload = await initMultipart(config, defaultUploadBody);

    await expect(
      abortMultipart(config, { ticket: upload.ticket }),
    ).resolves.toEqual({
      key: upload.key,
      bucket: TEST_BUCKET,
      uploadId: upload.uploadId,
    });
    expect(s3.uploads.has(upload.uploadId)).toBe(false);
    expect(order).toEqual(["guard", "onAbort"]);
    expect(guard.mock.calls[0][0]).toMatchObject({
      operation: "multipart.abort",
      action: "abort",
      uploadId: upload.uploadId,
    });
    const context = onAbort.mock.calls[0][0];
    expect(context).toMatchObject({
      operation: "multipart.abort",
      route: "uploads",
      key: upload.key,
      uploadId: upload.uploadId,
      uploadToken: guard.mock.calls[0][0].uploadToken,
      file: { name: "a.png", size: 10, type: "image/png" },
    });
    expect(context).not.toHaveProperty("action");
  });

  it("accepts an expired ticket for 7 days", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const { s3, config } = setup({ ticketExpiresIn: 60 });
    const first = await initMultipart(config, defaultUploadBody);
    const second = await initMultipart(config, defaultUploadBody);
    const expiredAt = NOW.getTime() + 60_000;

    vi.setSystemTime(expiredAt + 1000);
    await expect(
      completeMultipart(config, { ticket: first.ticket }),
    ).rejects.toMatchObject({ code: "UPLOAD_TICKET_EXPIRED", statusCode: 410 });

    vi.setSystemTime(expiredAt + 7 * DAY_MS);
    await expect(
      abortMultipart(config, { ticket: first.ticket }),
    ).resolves.toEqual({
      key: first.key,
      bucket: TEST_BUCKET,
      uploadId: first.uploadId,
    });

    vi.setSystemTime(expiredAt + 7 * DAY_MS + 1000);
    await expect(
      abortMultipart(config, { ticket: second.ticket }),
    ).rejects.toMatchObject({ code: "UPLOAD_TICKET_EXPIRED", statusCode: 410 });
    expect(s3.uploads.has(second.uploadId)).toBe(true);
  });

  it("does not abort when the guard rejects", async () => {
    const onAbort = vi.fn();
    const { s3, config } = setup({
      guard: [
        {
          hook: () => {
            throw s3Error("FORBIDDEN");
          },
        },
      ],
      onAbort: [{ hook: onAbort }],
    });
    const upload = await initMultipart(config, defaultUploadBody);

    await expect(
      abortMultipart(config, { ticket: upload.ticket }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(s3.send).not.toHaveBeenCalledWith(
      expect.any(AbortMultipartUploadCommand),
    );
    expect(onAbort).not.toHaveBeenCalled();
  });

  it("succeeds again when the upload is already gone, like delete", async () => {
    const onAbort = vi.fn();
    const { config } = setup({ onAbort: [{ hook: onAbort }] });
    const upload = await initMultipart(config, defaultUploadBody);
    await abortMultipart(config, { ticket: upload.ticket });

    await expect(
      abortMultipart(config, { ticket: upload.ticket }),
    ).resolves.toEqual({
      key: upload.key,
      bucket: TEST_BUCKET,
      uploadId: upload.uploadId,
    });
    // The bookkeeping runs again, so a lost first response is harmless.
    expect(onAbort).toHaveBeenCalledTimes(2);
  });

  it("fails with CONFLICT when the upload was completed", async () => {
    const onAbort = vi.fn();
    const { s3, config } = setup({ onAbort: [{ hook: onAbort }] });
    const upload = await initMultipart(config, defaultUploadBody);
    // What a completed upload leaves: no upload, an object with its marker.
    const marker = s3.uploads.get(upload.uploadId)?.fields.metadata[
      "dimah-upload"
    ];
    s3.uploads.delete(upload.uploadId);
    s3.seed(upload.key, "done", { metadata: { "dimah-upload": marker ?? "" } });

    await expect(
      abortMultipart(config, { ticket: upload.ticket }),
    ).rejects.toMatchObject({ code: "CONFLICT", statusCode: 409 });
    expect(onAbort).not.toHaveBeenCalled();
  });
});
