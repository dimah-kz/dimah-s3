import { UploadPartCommand } from "@aws-sdk/client-s3";
import { S3_MIN_PART_SIZE, s3Error, sha256Base64 } from "@dimah-s3/core";
import { describe, expect, it, vi } from "vitest";
import {
  defaultUploadBody,
  memoryS3,
  testConfig,
  testMultipart,
  testRoute,
  testUpload,
} from "@/test/harness";
import type { MultipartGuardContext } from "@/types";
import type { ResolvedMultipart } from "@/types/resolved";
import { initMultipart } from "./init";
import { listMultipartParts } from "./list-parts";

function setup(multipart: Partial<ResolvedMultipart> = {}) {
  const s3 = memoryS3();
  const config = testConfig({
    routes: {
      uploads: testRoute({
        client: s3.client,
        upload: testUpload({
          checksum: true,
          multipart: testMultipart({
            partSize: S3_MIN_PART_SIZE,
            ...multipart,
          }),
        }),
      }),
    },
  });
  return { s3, config };
}

describe("listMultipartParts", () => {
  it("lists uploaded parts with their size, ETag and checksum", async () => {
    const { s3, config } = setup();
    const upload = await initMultipart(config, {
      ...defaultUploadBody,
      size: S3_MIN_PART_SIZE + 3,
    });
    const part = new Uint8Array(3);
    const checksum = await sha256Base64(part);
    await s3.send(
      new UploadPartCommand({
        Bucket: upload.bucket,
        Key: upload.key,
        UploadId: upload.uploadId,
        PartNumber: 2,
        Body: part,
        ChecksumSHA256: checksum,
      }),
    );
    const eTag = s3.uploads.get(upload.uploadId)?.parts.get(2)?.eTag;

    await expect(
      listMultipartParts(config, { ticket: upload.ticket }),
    ).resolves.toEqual({
      parts: [
        { partNumber: 2, size: 3, eTag: eTag?.replaceAll('"', ""), checksum },
      ],
    });
  });

  it("runs upload.multipart.guard with action list", async () => {
    const guard = vi.fn<(context: MultipartGuardContext) => void>();
    const { config } = setup({ guard: [{ hook: guard }] });
    const upload = await initMultipart(config, defaultUploadBody);

    await expect(
      listMultipartParts(config, { ticket: upload.ticket }),
    ).resolves.toEqual({ parts: [] });
    expect(guard).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "multipart.listParts",
        action: "list",
        uploadId: upload.uploadId,
        key: upload.key,
      }),
    );
  });

  it("does not list when the guard rejects", async () => {
    const { s3, config } = setup({
      guard: [
        {
          hook: () => {
            throw s3Error("FORBIDDEN");
          },
        },
      ],
    });
    const upload = await initMultipart(config, defaultUploadBody);
    s3.send.mockClear();

    await expect(
      listMultipartParts(config, { ticket: upload.ticket }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(s3.send).not.toHaveBeenCalled();
  });

  it("fails with OBJECT_NOT_FOUND once the upload is gone", async () => {
    const { s3, config } = setup();
    const upload = await initMultipart(config, defaultUploadBody);
    s3.uploads.clear();

    await expect(
      listMultipartParts(config, { ticket: upload.ticket }),
    ).rejects.toMatchObject({ code: "OBJECT_NOT_FOUND", statusCode: 404 });
  });
});
