import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  UploadPartCommand,
  type CreateMultipartUploadCommand,
  type ListPartsCommand,
} from "@aws-sdk/client-s3";
import {
  buildContentDisposition,
  type MultipartInitResponse,
  S3_MIN_PART_SIZE,
  s3Error,
  sha256Base64,
} from "@dimah-s3/core";
import { describe, expect, it, vi } from "vitest";
import {
  defaultUploadBody,
  memoryS3,
  mockS3,
  sendByCommand,
  TEST_BUCKET,
  testConfig,
  testMultipart,
  testRoute,
  testUpload,
  type MemoryS3,
} from "@/test/harness";
import type {
  MultipartGuardContext,
  UploadConfirmGuardContext,
  UploadOnConfirmedContext,
} from "@/types";
import type { ResolvedConfig, ResolvedUpload } from "@/types/resolved";
import { completeMultipart } from "./complete";
import { initMultipart } from "./init";
import { signMultipartPart } from "./sign-part";

/** Two parts: 5 MiB, then 3 bytes. */
const SIZE = S3_MIN_PART_SIZE + 3;
const bytes = Uint8Array.from({ length: SIZE }, (_, index) => index % 251);

function setup(upload: Partial<ResolvedUpload> = {}) {
  const s3 = memoryS3();
  const config = testConfig({
    routes: {
      uploads: testRoute({
        client: s3.client,
        upload: testUpload({
          multipart: testMultipart({ partSize: S3_MIN_PART_SIZE }),
          ...upload,
        }),
      }),
    },
  });
  return { s3, config };
}

async function init(config: ResolvedConfig) {
  return initMultipart(config, { ...defaultUploadBody, size: SIZE });
}

/** Sends one part to S3 the way the browser would, without signing it. */
function sendPart(
  s3: MemoryS3,
  upload: MultipartInitResponse,
  partNumber: number,
  body: Uint8Array,
  checksum?: string,
) {
  return s3.send(
    new UploadPartCommand({
      Bucket: upload.bucket,
      Key: upload.key,
      UploadId: upload.uploadId,
      PartNumber: partNumber,
      Body: body,
      ChecksumSHA256: checksum,
    }),
  );
}

/** Signs and uploads every part, with a checksum when the upload needs one. */
async function uploadParts(
  s3: MemoryS3,
  config: ResolvedConfig,
  upload: MultipartInitResponse,
) {
  for (let partNumber = 1; partNumber <= upload.partCount; partNumber++) {
    const start = (partNumber - 1) * upload.partSize;
    const part = bytes.slice(start, start + upload.partSize);
    const checksum = upload.checksum ? await sha256Base64(part) : undefined;
    const signed = await signMultipartPart(config, {
      ticket: upload.ticket,
      partNumber,
      checksum,
    });
    expect(part).toHaveLength(signed.size);
    await sendPart(s3, upload, partNumber, part, checksum);
  }
}

function completeInput(s3: MemoryS3) {
  const call = s3.send.mock.calls.find(
    ([command]) => command instanceof CompleteMultipartUploadCommand,
  );
  return (call?.[0] as CompleteMultipartUploadCommand | undefined)?.input;
}

describe("completeMultipart", () => {
  it("assembles parts 1..partCount and returns the verified object", async () => {
    const { s3, config } = setup({
      object: () => ({ metadata: { source: "web" } }),
    });
    const upload = await init(config);
    await uploadParts(s3, config, upload);

    const result = await completeMultipart(config, { ticket: upload.ticket });
    const stored = s3.get(upload.key);
    expect(result).toEqual({
      key: upload.key,
      bucket: TEST_BUCKET,
      uploadId: upload.uploadId,
      name: "a.png",
      size: SIZE,
      type: "image/png",
      eTag: stored?.eTag.replaceAll('"', ""),
      lastModified: stored?.lastModified.toISOString(),
      metadata: { source: "web" },
      acl: "private",
    });
    expect(Buffer.from(stored?.body ?? []).equals(bytes)).toBe(true);
    expect(stored?.contentDisposition).toBe(buildContentDisposition("a.png"));
    expect(completeInput(s3)?.MultipartUpload?.Parts).toEqual([
      { PartNumber: 1, ETag: expect.any(String) },
      { PartNumber: 2, ETag: expect.any(String) },
    ]);
  });

  it("runs the multipart guard, confirmGuard and onConfirmed in order", async () => {
    const order: string[] = [];
    const guard = vi.fn<(context: MultipartGuardContext) => void>(() => {
      order.push("multipart.guard");
    });
    const confirmGuard = vi.fn<(context: UploadConfirmGuardContext) => void>(
      () => {
        order.push("confirmGuard");
      },
    );
    const onConfirmed = vi.fn<(context: UploadOnConfirmedContext) => void>(
      () => {
        order.push("onConfirmed");
      },
    );
    const { s3, config } = setup({
      multipart: testMultipart({
        partSize: S3_MIN_PART_SIZE,
        guard: [{ hook: guard }],
      }),
      confirmGuard: [{ hook: confirmGuard }],
      onConfirmed: [{ hook: onConfirmed }],
    });
    const upload = await init(config);
    await uploadParts(s3, config, upload);
    order.length = 0;
    guard.mockClear();

    await completeMultipart(config, { ticket: upload.ticket });
    expect(order).toEqual(["multipart.guard", "confirmGuard", "onConfirmed"]);
    expect(guard.mock.calls[0][0]).toMatchObject({
      operation: "multipart.complete",
      action: "complete",
      uploadId: upload.uploadId,
    });
    const uploadToken = guard.mock.calls[0][0].uploadToken;
    expect(confirmGuard.mock.calls[0][0]).toMatchObject({
      kind: "multipart",
      key: upload.key,
      uploadId: upload.uploadId,
      uploadToken,
      file: { name: "a.png", size: SIZE, type: "image/png" },
      acl: "private",
      // The guard sees what HeadObject verified, not only the declared file.
      object: { size: SIZE, type: "image/png", metadata: {} },
    });
    const confirmed = onConfirmed.mock.calls[0][0];
    expect(confirmed).toMatchObject({
      operation: "multipart.complete",
      kind: "multipart",
      uploadId: upload.uploadId,
      uploadToken,
      file: { name: "a.png", size: SIZE, type: "image/png" },
      object: { size: SIZE, type: "image/png", metadata: {} },
    });
  });

  it("reads every ListParts page before completing", async () => {
    const partCount = 1001;
    const size = partCount * S3_MIN_PART_SIZE;
    let metadata: Record<string, string> | undefined;
    const listParts = vi.fn(async (command: ListPartsCommand) => {
      const marker = Number(command.input.PartNumberMarker ?? 0);
      const numbers = Array.from(
        { length: Math.min(1000, partCount - marker) },
        (_, index) => marker + index + 1,
      );
      const truncated = numbers.at(-1) !== partCount;
      return {
        Parts: numbers.map((PartNumber) => ({
          PartNumber,
          Size: S3_MIN_PART_SIZE,
          ETag: `"p${PartNumber}"`,
        })),
        IsTruncated: truncated,
        NextPartNumberMarker: truncated ? String(numbers.at(-1)) : undefined,
      };
    });
    const send = sendByCommand({
      CreateMultipartUploadCommand: (command: CreateMultipartUploadCommand) => {
        metadata = command.input.Metadata;
        return { UploadId: "up-1" };
      },
      ListPartsCommand: listParts,
      HeadObjectCommand: () => ({
        ContentLength: size,
        ContentType: "image/png",
        ContentDisposition: buildContentDisposition("a.png"),
        ETag: '"final-1001"',
        Metadata: metadata,
      }),
    });
    const config = testConfig({
      routes: {
        uploads: testRoute({
          client: mockS3(send as never),
          upload: testUpload({
            multipart: testMultipart({ partSize: S3_MIN_PART_SIZE }),
          }),
        }),
      },
    });
    const upload = await initMultipart(config, { ...defaultUploadBody, size });
    expect(upload.partCount).toBe(partCount);

    await expect(
      completeMultipart(config, { ticket: upload.ticket }),
    ).resolves.toMatchObject({ size, uploadId: "up-1" });
    expect(
      listParts.mock.calls.map(([command]) => command.input.PartNumberMarker),
    ).toEqual([undefined, "1000"]);
    const complete = send.mock.calls
      .map(([command]) => command)
      .find((command) => command instanceof CompleteMultipartUploadCommand);
    const parts = (complete as CompleteMultipartUploadCommand).input
      .MultipartUpload?.Parts;
    expect(parts).toHaveLength(partCount);
    expect(parts?.at(-1)).toEqual({ PartNumber: 1001, ETag: '"p1001"' });
  });

  it("fails with MULTIPART_PART_MISSING and keeps the upload open", async () => {
    const { s3, config } = setup();
    const upload = await init(config);
    await sendPart(s3, upload, 1, bytes.slice(0, S3_MIN_PART_SIZE));

    await expect(
      completeMultipart(config, { ticket: upload.ticket }),
    ).rejects.toMatchObject({
      code: "MULTIPART_PART_MISSING",
      statusCode: 400,
      params: { partNumber: 2 },
    });
    expect(completeInput(s3)).toBeUndefined();
    expect(s3.uploads.has(upload.uploadId)).toBe(true);
  });

  it("counts a listed part without an ETag as missing", async () => {
    const send = sendByCommand({
      CreateMultipartUploadCommand: { UploadId: "up-1" },
      ListPartsCommand: {
        Parts: [
          { PartNumber: 1, Size: S3_MIN_PART_SIZE, ETag: '"p1"' },
          { PartNumber: 2, Size: 3 },
        ],
      },
    });
    const config = testConfig({
      routes: {
        uploads: testRoute({
          client: mockS3(send as never),
          upload: testUpload({
            multipart: testMultipart({ partSize: S3_MIN_PART_SIZE }),
          }),
        }),
      },
    });
    const upload = await init(config);

    await expect(
      completeMultipart(config, { ticket: upload.ticket }),
    ).rejects.toMatchObject({
      code: "MULTIPART_PART_MISSING",
      params: { partNumber: 2 },
    });
    expect(send).not.toHaveBeenCalledWith(
      expect.any(CompleteMultipartUploadCommand),
    );
  });

  it("fails with UPLOAD_SIZE_MISMATCH when a part has another size", async () => {
    const { s3, config } = setup();
    const upload = await init(config);
    await sendPart(s3, upload, 1, bytes.slice(0, S3_MIN_PART_SIZE));
    await sendPart(s3, upload, 2, new Uint8Array(4));

    await expect(
      completeMultipart(config, { ticket: upload.ticket }),
    ).rejects.toMatchObject({
      code: "UPLOAD_SIZE_MISMATCH",
      statusCode: 400,
      params: { expected: 3, actual: 4 },
    });
    expect(completeInput(s3)).toBeUndefined();
  });

  it("leaves out parts past the layout", async () => {
    const { s3, config } = setup();
    const upload = await init(config);
    await uploadParts(s3, config, upload);
    await sendPart(s3, upload, 3, new Uint8Array(1));

    await expect(
      completeMultipart(config, { ticket: upload.ticket }),
    ).resolves.toMatchObject({ size: SIZE });
    expect(completeInput(s3)?.MultipartUpload?.Parts).toHaveLength(2);
  });

  it("completes with every part checksum when the ticket requires them", async () => {
    const { s3, config } = setup({ checksum: true });
    const upload = await init(config);
    await uploadParts(s3, config, upload);

    await expect(
      completeMultipart(config, { ticket: upload.ticket }),
    ).resolves.toMatchObject({ size: SIZE });
    const first = await sha256Base64(bytes.slice(0, S3_MIN_PART_SIZE));
    const second = await sha256Base64(bytes.slice(S3_MIN_PART_SIZE));
    expect(completeInput(s3)?.MultipartUpload?.Parts).toEqual([
      { PartNumber: 1, ETag: expect.any(String), ChecksumSHA256: first },
      { PartNumber: 2, ETag: expect.any(String), ChecksumSHA256: second },
    ]);
    expect(s3.get(upload.key)?.checksum).toMatch(/-2$/);
  });

  it("fails with CHECKSUM_REQUIRED when a part has no checksum", async () => {
    const { s3, config } = setup({ checksum: true });
    const upload = await init(config);
    const first = bytes.slice(0, S3_MIN_PART_SIZE);
    await sendPart(s3, upload, 1, first, await sha256Base64(first));
    await sendPart(s3, upload, 2, bytes.slice(S3_MIN_PART_SIZE));

    await expect(
      completeMultipart(config, { ticket: upload.ticket }),
    ).rejects.toMatchObject({ code: "CHECKSUM_REQUIRED", statusCode: 400 });
    expect(completeInput(s3)).toBeUndefined();
  });

  it("deletes the object when confirmGuard rejects", async () => {
    const { s3, config } = setup({
      confirmGuard: [
        {
          hook: () => {
            throw s3Error("FORBIDDEN");
          },
        },
      ],
    });
    const upload = await init(config);
    await uploadParts(s3, config, upload);

    await expect(
      completeMultipart(config, { ticket: upload.ticket }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(s3.get(upload.key)).toBeUndefined();
  });

  it("finalizes the stored object again on a retry", async () => {
    const onConfirmed = vi
      .fn<(context: UploadOnConfirmedContext) => void>()
      .mockImplementationOnce(() => {
        throw new Error("webhook down");
      });
    const { s3, config } = setup({ onConfirmed: [{ hook: onConfirmed }] });
    const upload = await init(config);
    await uploadParts(s3, config, upload);

    await expect(
      completeMultipart(config, { ticket: upload.ticket }),
    ).rejects.toMatchObject({ code: "INTERNAL_ERROR", statusCode: 500 });
    expect(s3.get(upload.key)).toBeDefined();
    expect(s3.uploads.has(upload.uploadId)).toBe(false);

    await expect(
      completeMultipart(config, { ticket: upload.ticket }),
    ).resolves.toMatchObject({ key: upload.key, size: SIZE });
    expect(onConfirmed).toHaveBeenCalledTimes(2);
    expect(onConfirmed.mock.calls[1][0].uploadToken).toBe(
      onConfirmed.mock.calls[0][0].uploadToken,
    );
  });

  it("finalizes the object when a concurrent call completes the upload first", async () => {
    const { s3, config } = setup();
    const upload = await init(config);
    await uploadParts(s3, config, upload);
    const real = s3.send.getMockImplementation();
    if (!real) throw new Error("expected a send implementation");
    s3.send.mockImplementation(async (command, options) => {
      if (command instanceof CompleteMultipartUploadCommand) {
        // The other call wins between our ListParts and our complete, so
        // ours gets NoSuchUpload.
        s3.send.mockImplementation(real);
        await real(command, options);
      }
      return real(command, options);
    });

    await expect(
      completeMultipart(config, { ticket: upload.ticket }),
    ).resolves.toMatchObject({ key: upload.key, size: SIZE });
    expect(s3.get(upload.key)).toBeDefined();
  });

  it("reports the ACL chosen by object(), not the route default", async () => {
    const onConfirmed = vi.fn<(context: UploadOnConfirmedContext) => void>();
    const { s3, config } = setup({
      acl: "private",
      object: () => ({ acl: "public-read" }),
      onConfirmed: [{ hook: onConfirmed }],
    });
    const upload = await init(config);
    await uploadParts(s3, config, upload);

    await expect(
      completeMultipart(config, { ticket: upload.ticket }),
    ).resolves.toMatchObject({ acl: "public-read" });
    expect(onConfirmed.mock.calls[0][0].acl).toBe("public-read");
  });

  it("fails with OBJECT_NOT_FOUND when the upload was aborted", async () => {
    const { s3, config } = setup();
    const upload = await init(config);
    await s3.send(
      new AbortMultipartUploadCommand({
        Bucket: upload.bucket,
        Key: upload.key,
        UploadId: upload.uploadId,
      }),
    );

    await expect(
      completeMultipart(config, { ticket: upload.ticket }),
    ).rejects.toMatchObject({ code: "OBJECT_NOT_FOUND", statusCode: 404 });
  });

  it("does not finalize another upload's object at the key", async () => {
    const { s3, config } = setup();
    const upload = await init(config);
    await s3.send(
      new AbortMultipartUploadCommand({
        Bucket: upload.bucket,
        Key: upload.key,
        UploadId: upload.uploadId,
      }),
    );
    s3.seed(upload.key, bytes, { metadata: { "dimah-upload": "other" } });

    await expect(
      completeMultipart(config, { ticket: upload.ticket }),
    ).rejects.toMatchObject({ code: "OBJECT_NOT_FOUND" });
    expect(s3.get(upload.key)).toBeDefined();
  });
});
