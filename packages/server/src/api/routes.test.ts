import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { S3_API_ROUTES, S3_ERROR_CODES } from "@dimah-s3/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  apiUrl,
  createInstance,
  expectErrorCode,
  jsonRequest,
  mockS3,
} from "../test/harness";

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn(async () => "https://s3.test/signed"),
}));

vi.mock("@aws-sdk/s3-presigned-post", () => ({
  createPresignedPost: vi.fn(async () => ({
    url: "https://s3.test/post",
    fields: { key: "a.png", Policy: "p" },
  })),
}));

function headResult(overrides: Record<string, unknown> = {}) {
  return {
    ContentType: "image/png",
    ContentLength: 10,
    ETag: '"abc"',
    Metadata: { source: "web" },
    ContentDisposition: 'attachment; filename="a.png"',
    ...overrides,
  };
}

function sendByCommand(handlers: Record<string, unknown>) {
  return vi.fn(async (command: { constructor: { name: string } }) => {
    const name = command.constructor.name;
    const result = handlers[name];
    if (typeof result === "function") return result(command);
    if (result !== undefined) return result;
    return {};
  });
}

describe("upload / confirm", () => {
  beforeEach(() => {
    vi.mocked(createPresignedPost).mockClear();
    vi.mocked(getSignedUrl).mockClear();
  });

  it("presigns POST uploads and runs onPresigned", async () => {
    const onPresigned = vi.fn();
    const s3 = createInstance({
      upload: { enabled: true, onPresigned },
    });

    const res = await s3.handler(
      jsonRequest(apiUrl(S3_API_ROUTES.upload), {
        body: { key: "a.png", contentType: "image/png" },
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      bucket: "bucket",
      key: "a.png",
      url: "https://s3.test/post",
      method: "POST",
    });
    expect(onPresigned).toHaveBeenCalledWith(
      expect.objectContaining({ key: "a.png", bucket: "bucket" }),
    );
  });

  it("presigns PUT uploads when configured", async () => {
    const s3 = createInstance({
      upload: { enabled: true, method: "PUT" },
    });

    const body = await s3.api.upload({
      body: { key: "a.png", contentType: "image/png", fileName: "a.png" },
    });

    expect(body).toMatchObject({
      method: "PUT",
      url: "https://s3.test/signed",
      headers: expect.objectContaining({ "Content-Type": "image/png" }),
    });
    expect(getSignedUrl).toHaveBeenCalled();
  });

  it("requires fileSize for PUT when configured", async () => {
    const s3 = createInstance({
      upload: { enabled: true, method: "PUT", requireFileSize: true },
    });

    await expect(
      s3.api.upload({ body: { key: "a.png" } }),
    ).rejects.toMatchObject({
      code: S3_ERROR_CODES.FILE_SIZE_REQUIRED_UPLOAD,
      status: 400,
    });
  });

  it("confirms from HeadObject metadata", async () => {
    const onConfirmed = vi.fn();
    const s3 = createInstance({
      s3: mockS3(
        sendByCommand({
          HeadObjectCommand: headResult(),
        }) as never,
      ),
      upload: { enabled: true, onConfirmed },
    });

    const confirmed = await s3.api.confirm({ body: { key: "a.png" } });
    expect(confirmed).toMatchObject({
      key: "a.png",
      bucket: "bucket",
      contentType: "image/png",
      contentLength: 10,
      eTag: "abc",
      fileName: "a.png",
    });
    expect(onConfirmed).toHaveBeenCalled();
  });
});

describe("download / delete", () => {
  it("presigns a download after HeadObject succeeds", async () => {
    const s3 = createInstance({
      s3: mockS3(sendByCommand({ HeadObjectCommand: headResult() }) as never),
      download: { enabled: true },
    });

    const body = await s3.api.download({ query: { key: "a.png" } });
    expect(body).toMatchObject({
      key: "a.png",
      url: "https://s3.test/signed",
    });
  });

  it("maps missing objects to OBJECT_NOT_FOUND", async () => {
    const s3 = createInstance({
      s3: mockS3(
        vi.fn(async () => {
          throw Object.assign(new Error("missing"), { name: "NoSuchKey" });
        }) as never,
      ),
      download: { enabled: true },
    });

    await expect(
      s3.api.download({ query: { key: "missing.png" } }),
    ).rejects.toMatchObject({
      code: S3_ERROR_CODES.OBJECT_NOT_FOUND,
      status: 404,
    });
  });

  it("deletes after a successful head", async () => {
    const onDeleted = vi.fn();
    const send = sendByCommand({
      HeadObjectCommand: headResult(),
      DeleteObjectCommand: {},
    });
    const s3 = createInstance({
      s3: mockS3(send as never),
      delete: { enabled: true, onDeleted },
    });

    await expect(s3.api.delete({ query: { key: "a.png" } })).resolves.toEqual({
      success: true,
      bucket: "bucket",
      key: "a.png",
    });
    expect(onDeleted).toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith(expect.any(HeadObjectCommand));
  });
});

describe("multipart", () => {
  it("inits a multipart upload", async () => {
    const onInit = vi.fn();
    const s3 = createInstance({
      s3: mockS3(
        sendByCommand({
          CreateMultipartUploadCommand: { UploadId: "up-1" },
        }) as never,
      ),
      multipart: { enabled: true, onInit },
    });

    const res = await s3.handler(
      jsonRequest(apiUrl(S3_API_ROUTES.multipartInit), {
        body: { key: "a.bin", fileSize: 10 },
      }),
    );
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({
      bucket: "bucket",
      key: "a.bin",
      uploadId: "up-1",
    });
    expect(onInit).toHaveBeenCalled();
  });

  it("requires fileSize when configured", async () => {
    const s3 = createInstance({
      multipart: { enabled: true, requireFileSize: true },
    });
    await expect(
      s3.api.multipartInit({ body: { key: "a.bin" } }),
    ).rejects.toMatchObject({
      code: S3_ERROR_CODES.FILE_SIZE_REQUIRED_MULTIPART,
    });
  });

  it("aborts a multipart upload", async () => {
    const onAbort = vi.fn();
    const s3 = createInstance({
      multipart: { enabled: true, onAbort },
    });

    await expect(
      s3.api.multipartAbort({
        body: { key: "a.bin", uploadId: "up-1" },
      }),
    ).resolves.toEqual({
      aborted: true,
      bucket: "bucket",
      key: "a.bin",
      uploadId: "up-1",
    });
    expect(onAbort).toHaveBeenCalled();
  });
});

describe("feature guards", () => {
  it("runs upload.presignGuard after the global guard", async () => {
    const order: string[] = [];
    const s3 = createInstance({
      guard: () => {
        order.push("global");
      },
      upload: {
        enabled: true,
        presignGuard: () => {
          order.push("presign");
        },
      },
    });

    await s3.api.upload({ body: { key: "a.png" } });
    expect(order).toEqual(["global", "presign"]);
  });
});

describe("HTTP vs s3.api", () => {
  it("returns the same validation error shape", async () => {
    const s3 = createInstance({ upload: { enabled: true } });
    const res = await s3.handler(
      jsonRequest(apiUrl(S3_API_ROUTES.upload), { body: {} }),
    );
    await expectErrorCode(res, 400, S3_ERROR_CODES.VALIDATION_ERROR);

    await expect(s3.api.upload({ body: {} as never })).rejects.toMatchObject({
      code: S3_ERROR_CODES.VALIDATION_ERROR,
      status: 400,
    });
  });
});
