import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { S3_ERROR_CODES } from "@dimah-s3/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createInstance,
  headResult,
  mockS3,
  sendByCommand,
} from "@/test/harness";

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn(async () => "https://s3.test/signed"),
}));

vi.mock("@aws-sdk/s3-presigned-post", () => ({
  createPresignedPost: vi.fn(async () => ({
    url: "https://s3.test/post",
    fields: { key: "a.png", Policy: "p" },
  })),
}));

describe("upload", () => {
  beforeEach(() => {
    vi.mocked(createPresignedPost).mockClear();
    vi.mocked(getSignedUrl).mockClear();
  });

  it("presigns POST uploads and runs onPresigned", async () => {
    const onPresigned = vi.fn();
    const s3 = createInstance({
      upload: { enabled: true, onPresigned },
    });

    await expect(
      s3.api.upload({ body: { key: "a.png", contentType: "image/png" } }),
    ).resolves.toMatchObject({
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

    await expect(
      s3.api.upload({
        body: { key: "a.png", contentType: "image/png", fileName: "a.png" },
      }),
    ).resolves.toMatchObject({
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
      code: S3_ERROR_CODES.FILE_SIZE_REQUIRED_UPLOAD.code,
      statusCode: 400,
    });
  });

  it("requires fileSize for POST when configured", async () => {
    const s3 = createInstance({
      upload: { enabled: true, requireFileSize: true },
    });

    await expect(
      s3.api.upload({ body: { key: "a.png" } }),
    ).rejects.toMatchObject({
      code: S3_ERROR_CODES.FILE_SIZE_REQUIRED_UPLOAD.code,
      statusCode: 400,
    });
  });

  it("keeps objects private unless allowClientAcl is set", async () => {
    const s3 = createInstance({ upload: true });
    await s3.api.upload({
      body: { key: "a.png", acl: "public-read" },
    });
    expect(createPresignedPost).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        Fields: expect.objectContaining({ acl: "private" }),
      }),
    );
  });

  it("honors a client ACL when allowClientAcl is set", async () => {
    const s3 = createInstance({
      upload: { allowClientAcl: true },
    });
    await s3.api.upload({
      body: { key: "a.png", acl: "public-read" },
    });
    expect(createPresignedPost).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        Fields: expect.objectContaining({ acl: "public-read" }),
      }),
    );
  });

  it("signs PUT metadata onto the command and response headers", async () => {
    const s3 = createInstance({
      upload: { enabled: true, method: "PUT" },
    });

    await expect(
      s3.api.upload({
        body: {
          key: "a.png",
          contentType: "image/png",
          metadata: { source: "web" },
        },
      }),
    ).resolves.toMatchObject({
      method: "PUT",
      headers: expect.objectContaining({ "x-amz-meta-source": "web" }),
    });

    const command = vi.mocked(getSignedUrl).mock.calls.at(-1)?.[1] as {
      input?: { Metadata?: Record<string, string> };
    };
    expect(command.input?.Metadata).toEqual({ source: "web" });
  });

  it("ignores a client-supplied bucket by default", async () => {
    const s3 = createInstance({ upload: true });
    await expect(
      s3.api.upload({ body: { key: "a.png", bucket: "other" } }),
    ).resolves.toMatchObject({ bucket: "bucket" });
  });

  it("allows a client bucket when allowlisted", async () => {
    const s3 = createInstance({
      upload: true,
      buckets: ["bucket", "other"],
    });
    await expect(
      s3.api.upload({ body: { key: "a.png", bucket: "other" } }),
    ).resolves.toMatchObject({ bucket: "other" });
  });

  it("prefixes the object key", async () => {
    const s3 = createInstance({
      upload: { prefix: "uploads" },
    });
    await expect(
      s3.api.upload({ body: { key: "a.png" } }),
    ).resolves.toMatchObject({ key: "uploads/a.png" });
  });

  it("caps unsigned POST uploads at 5 GiB", async () => {
    const s3 = createInstance({ upload: true });
    await s3.api.upload({ body: { key: "a.png" } });
    expect(createPresignedPost).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        Conditions: [["content-length-range", 1, 5 * 1024 * 1024 * 1024]],
      }),
    );
  });

  it("clamps expiresIn to maxExpiresIn", async () => {
    const s3 = createInstance({ upload: true, maxExpiresIn: 60 });
    await s3.api.upload({ body: { key: "a.png", expiresIn: 600 } });
    expect(createPresignedPost).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ Expires: 60 }),
    );
  });

  it("rejects a bucket outside the allowlist", async () => {
    const s3 = createInstance({ upload: true, buckets: ["bucket"] });
    await expect(
      s3.api.upload({ body: { key: "a.png", bucket: "other" } }),
    ).rejects.toMatchObject({
      code: S3_ERROR_CODES.INVALID_BUCKET.code,
      statusCode: 403,
    });
  });

  it("forces a server ACL over the client value", async () => {
    const s3 = createInstance({
      upload: { acl: "public-read" },
    });
    await s3.api.upload({
      body: { key: "a.png", acl: "private" },
    });
    expect(createPresignedPost).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        Fields: expect.objectContaining({ acl: "public-read" }),
      }),
    );
  });

  it("does not let s3.api callers replace bound config", async () => {
    const s3 = createInstance({ upload: true });
    await expect(
      s3.api.upload({
        body: { key: "a.png" },
        context: { config: { bucket: "hacked" } },
      }),
    ).resolves.toMatchObject({ bucket: "bucket" });
  });
});

describe("confirm", () => {
  it("confirms from HeadObject metadata", async () => {
    const onConfirmed = vi.fn();
    const s3 = createInstance({
      client: mockS3(
        sendByCommand({ HeadObjectCommand: headResult() }) as never,
      ),
      upload: { enabled: true, onConfirmed },
    });

    await expect(
      s3.api.confirm({ body: { key: "a.png" } }),
    ).resolves.toMatchObject({
      key: "a.png",
      bucket: "bucket",
      contentType: "image/png",
      contentLength: 10,
      eTag: "abc",
      fileName: "a.png",
    });
    expect(onConfirmed).toHaveBeenCalled();
  });

  it("rejects confirm when HeadObject omits ContentLength", async () => {
    const s3 = createInstance({
      client: mockS3(
        sendByCommand({
          HeadObjectCommand: headResult({ ContentLength: undefined }),
        }) as never,
      ),
      upload: { enabled: true },
    });

    await expect(
      s3.api.confirm({ body: { key: "a.png" } }),
    ).rejects.toMatchObject({
      code: S3_ERROR_CODES.INTERNAL_ERROR.code,
      statusCode: 500,
    });
  });

  it("maps a missing object to OBJECT_NOT_FOUND", async () => {
    const missing = vi.fn(async () => {
      throw Object.assign(new Error("missing"), { name: "NoSuchKey" });
    });
    const s3 = createInstance({
      client: mockS3(missing as never),
      upload: { enabled: true },
    });

    await expect(
      s3.api.confirm({ body: { key: "missing.png" } }),
    ).rejects.toMatchObject({
      code: S3_ERROR_CODES.OBJECT_NOT_FOUND.code,
      status: "NOT_FOUND",
      statusCode: 404,
    });
  });

  it("resolves ACL when enabled", async () => {
    const s3 = createInstance({
      resolveObjectAcl: true,
      client: mockS3(
        sendByCommand({
          HeadObjectCommand: headResult(),
          GetObjectAclCommand: { Grants: [] },
        }) as never,
      ),
      upload: { enabled: true },
    });

    await expect(
      s3.api.confirm({ body: { key: "a.png" } }),
    ).resolves.toMatchObject({ acl: "private" });
  });
});

describe("download / delete", () => {
  it("presigns a download after HeadObject succeeds", async () => {
    const onPresigned = vi.fn();
    const s3 = createInstance({
      client: mockS3(
        sendByCommand({ HeadObjectCommand: headResult() }) as never,
      ),
      download: { enabled: true, onPresigned },
    });

    await expect(
      s3.api.download({ query: { key: "a.png", fileName: "save.png" } }),
    ).resolves.toMatchObject({
      key: "a.png",
      url: "https://s3.test/signed",
    });
    expect(onPresigned).toHaveBeenCalled();
  });

  it("maps missing objects to OBJECT_NOT_FOUND", async () => {
    const missing = vi.fn(async () => {
      throw Object.assign(new Error("missing"), { name: "NoSuchKey" });
    });
    const s3 = createInstance({
      client: mockS3(missing as never),
      download: { enabled: true },
      delete: { enabled: true },
    });

    await expect(
      s3.api.download({ query: { key: "missing.png" } }),
    ).rejects.toMatchObject({
      code: S3_ERROR_CODES.OBJECT_NOT_FOUND.code,
      status: "NOT_FOUND",
      statusCode: 404,
    });
    await expect(
      s3.api.delete({ query: { key: "missing.png" } }),
    ).rejects.toMatchObject({
      code: S3_ERROR_CODES.OBJECT_NOT_FOUND.code,
      status: "NOT_FOUND",
      statusCode: 404,
    });
  });

  it("deletes after a successful head", async () => {
    const onDeleted = vi.fn();
    const send = sendByCommand({
      HeadObjectCommand: headResult(),
      DeleteObjectCommand: {},
    });
    const s3 = createInstance({
      client: mockS3(send as never),
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
      client: mockS3(
        sendByCommand({
          CreateMultipartUploadCommand: { UploadId: "up-1" },
        }) as never,
      ),
      multipart: { enabled: true, onInit },
    });

    await expect(
      s3.api.multipartInit({ body: { key: "a.bin", fileSize: 10 } }),
    ).resolves.toEqual({
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
      code: S3_ERROR_CODES.FILE_SIZE_REQUIRED_MULTIPART.code,
    });
  });

  it("inherits requireFileSize from upload onto multipart", async () => {
    const s3 = createInstance({
      upload: { enabled: true, requireFileSize: true },
    });
    await expect(
      s3.api.multipartInit({ body: { key: "a.bin" } }),
    ).rejects.toMatchObject({
      code: S3_ERROR_CODES.FILE_SIZE_REQUIRED_MULTIPART.code,
    });
  });

  it("signs a part", async () => {
    const s3 = createInstance({ multipart: { enabled: true } });
    await expect(
      s3.api.multipartPart({
        body: { key: "a.bin", uploadId: "up-1", partNumber: 1, partSize: 8 },
      }),
    ).resolves.toMatchObject({
      presignedUrl: "https://s3.test/signed",
      partNumber: 1,
      uploadId: "up-1",
      partSize: 8,
    });
  });

  it("lists uploaded parts", async () => {
    const onList = vi.fn();
    const s3 = createInstance({
      client: mockS3(
        sendByCommand({
          ListPartsCommand: {
            Parts: [{ PartNumber: 1, Size: 8, ETag: '"p1"' }],
          },
        }) as never,
      ),
      multipart: { enabled: true, onList },
    });

    await expect(
      s3.api.multipartListParts({
        query: { key: "a.bin", uploadId: "up-1" },
      }),
    ).resolves.toEqual({
      parts: [{ partNumber: 1, size: 8, eTag: "p1" }],
    });
    expect(onList).toHaveBeenCalled();
  });

  it("completes from listed parts and HeadObject", async () => {
    const onComplete = vi.fn();
    const s3 = createInstance({
      client: mockS3(
        sendByCommand({
          ListPartsCommand: {
            Parts: [{ PartNumber: 1, ETag: '"p1"' }],
          },
          CompleteMultipartUploadCommand: { ETag: '"final"' },
          HeadObjectCommand: headResult({ ContentLength: 8 }),
        }) as never,
      ),
      multipart: { enabled: true, onComplete },
    });

    await expect(
      s3.api.multipartComplete({
        body: {
          key: "a.bin",
          uploadId: "up-1",
          parts: [{ partNumber: 1 }],
        },
      }),
    ).resolves.toMatchObject({
      key: "a.bin",
      uploadId: "up-1",
      contentLength: 8,
      eTag: "abc",
    });
    expect(onComplete).toHaveBeenCalled();
  });

  it("maps post-complete HeadObject not-found to OBJECT_NOT_FOUND", async () => {
    const s3 = createInstance({
      client: mockS3(
        sendByCommand({
          ListPartsCommand: {
            Parts: [{ PartNumber: 1, ETag: '"p1"' }],
          },
          CompleteMultipartUploadCommand: { ETag: '"final"' },
          HeadObjectCommand: async () => {
            throw Object.assign(new Error("missing"), { name: "NoSuchKey" });
          },
        }) as never,
      ),
      multipart: { enabled: true },
    });

    await expect(
      s3.api.multipartComplete({
        body: {
          key: "a.bin",
          uploadId: "up-1",
          parts: [{ partNumber: 1 }],
        },
      }),
    ).rejects.toMatchObject({
      code: S3_ERROR_CODES.OBJECT_NOT_FOUND.code,
      statusCode: 404,
    });
  });

  it("pages through truncated ListParts results", async () => {
    const listParts = vi
      .fn()
      .mockResolvedValueOnce({
        Parts: [{ PartNumber: 1, Size: 8, ETag: '"p1"' }],
        IsTruncated: true,
        NextPartNumberMarker: "1",
      })
      .mockResolvedValueOnce({
        Parts: [{ PartNumber: 2, Size: 8, ETag: '"p2"' }],
        IsTruncated: false,
      });
    const s3 = createInstance({
      client: mockS3(sendByCommand({ ListPartsCommand: listParts }) as never),
      multipart: { enabled: true },
    });

    await expect(
      s3.api.multipartListParts({
        query: { key: "a.bin", uploadId: "up-1" },
      }),
    ).resolves.toEqual({
      parts: [
        { partNumber: 1, size: 8, eTag: "p1" },
        { partNumber: 2, size: 8, eTag: "p2" },
      ],
    });
    expect(listParts).toHaveBeenCalledTimes(2);
  });

  it("rejects complete when a requested part has no ETag", async () => {
    const s3 = createInstance({
      client: mockS3(
        sendByCommand({
          ListPartsCommand: {
            Parts: [{ PartNumber: 2, ETag: '"p2"' }],
          },
        }) as never,
      ),
      multipart: { enabled: true },
    });

    await expect(
      s3.api.multipartComplete({
        body: {
          key: "a.bin",
          uploadId: "up-1",
          parts: [{ partNumber: 1 }],
        },
      }),
    ).rejects.toMatchObject({
      code: S3_ERROR_CODES.MULTIPART_PART_MISSING.code,
      params: { partNumber: 1 },
    });
  });

  it("maps abort of a missing upload to OBJECT_NOT_FOUND", async () => {
    const missing = vi.fn(async () => {
      throw Object.assign(new Error("missing"), { name: "NoSuchUpload" });
    });
    const s3 = createInstance({
      client: mockS3(missing as never),
      multipart: { enabled: true },
    });

    await expect(
      s3.api.multipartAbort({
        body: { key: "a.bin", uploadId: "gone" },
      }),
    ).rejects.toMatchObject({
      code: S3_ERROR_CODES.OBJECT_NOT_FOUND.code,
      status: "NOT_FOUND",
      statusCode: 404,
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
  it("runs upload.guard after the global guard", async () => {
    const order: string[] = [];
    const s3 = createInstance({
      guard: () => {
        order.push("global");
      },
      upload: {
        enabled: true,
        guard: () => {
          order.push("presign");
        },
      },
    });

    await s3.api.upload({ body: { key: "a.png" } });
    expect(order).toEqual(["global", "presign"]);
  });

  it("rejects allowClientBucket together with buckets", () => {
    expect(() =>
      createInstance({
        allowClientBucket: true,
        buckets: ["bucket"],
      }),
    ).toThrow(/allowClientBucket or buckets/);
  });
});
