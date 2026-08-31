import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { S3_ERROR_CODES } from "@dimah-s3/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  allFeaturesRoute,
  createInstance,
  defaultUploadBody,
  headResult,
  mockS3,
  sendByCommand,
  storedBinKey,
  storedPngKey,
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
      routes: { uploads: allFeaturesRoute({ upload: { onPresigned } }) },
    });

    await expect(
      s3.api.upload({ body: defaultUploadBody }),
    ).resolves.toMatchObject({
      bucket: "bucket",
      url: "https://s3.test/post",
      method: "POST",
    });
    expect(onPresigned).toHaveBeenCalledWith(
      expect.objectContaining({ bucket: "bucket", route: "uploads" }),
    );
  });

  it("presigns PUT uploads when configured", async () => {
    const s3 = createInstance({
      routes: {
        uploads: allFeaturesRoute({ upload: { method: "PUT" } }),
      },
    });

    await expect(
      s3.api.upload({ body: defaultUploadBody }),
    ).resolves.toMatchObject({
      method: "PUT",
      url: "https://s3.test/signed",
      headers: expect.objectContaining({ "Content-Type": "image/png" }),
    });
    expect(getSignedUrl).toHaveBeenCalled();
  });

  it("requires fileName and fileSize on the body", async () => {
    const s3 = createInstance();
    await expect(
      s3.api.upload({ body: { route: "uploads" } as never }),
    ).rejects.toMatchObject({
      code: S3_ERROR_CODES.VALIDATION_ERROR.code,
      statusCode: 400,
    });
  });

  it("keeps objects private unless the route sets acl", async () => {
    const s3 = createInstance();
    await s3.api.upload({ body: defaultUploadBody });
    expect(createPresignedPost).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        Fields: expect.objectContaining({ acl: "private" }),
      }),
    );
  });

  it("forces a server ACL", async () => {
    const s3 = createInstance({
      routes: {
        uploads: allFeaturesRoute({ upload: { acl: "public-read" } }),
      },
    });
    await s3.api.upload({ body: defaultUploadBody });
    expect(createPresignedPost).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        Fields: expect.objectContaining({ acl: "public-read" }),
      }),
    );
  });

  it("signs object() metadata onto the PUT command and response headers", async () => {
    const s3 = createInstance({
      routes: {
        uploads: allFeaturesRoute({
          upload: {
            method: "PUT",
            object: ({ clientMetadata }) => ({
              metadata: { author: clientMetadata?.author ?? "anon" },
            }),
          },
        }),
      },
    });

    await expect(
      s3.api.upload({
        body: { ...defaultUploadBody, metadata: { author: "user_123" } },
      }),
    ).resolves.toMatchObject({
      method: "PUT",
      headers: expect.objectContaining({ "x-amz-meta-author": "user_123" }),
    });

    const command = vi.mocked(getSignedUrl).mock.calls.at(-1)?.[1] as {
      input?: { Metadata?: Record<string, string> };
    };
    expect(command.input?.Metadata).toEqual({ author: "user_123" });
  });

  it("does not write client metadata to S3 unless object() copies it", async () => {
    const s3 = createInstance({
      routes: {
        uploads: allFeaturesRoute({ upload: { method: "PUT" } }),
      },
    });

    await expect(
      s3.api.upload({
        body: { ...defaultUploadBody, metadata: { source: "web" } },
      }),
    ).resolves.toMatchObject({
      method: "PUT",
      headers: expect.not.objectContaining({ "x-amz-meta-source": "web" }),
    });

    const command = vi.mocked(getSignedUrl).mock.calls.at(-1)?.[1] as {
      input?: { Metadata?: Record<string, string> };
    };
    expect(command.input?.Metadata).toBeUndefined();
  });

  it("uses the route bucket override", async () => {
    const s3 = createInstance({
      routes: {
        uploads: allFeaturesRoute({ bucket: "cdn-bucket" }),
      },
    });
    await expect(
      s3.api.upload({ body: defaultUploadBody }),
    ).resolves.toMatchObject({ bucket: "cdn-bucket" });
  });

  it("defaults the generated object key to route/uuid/filename", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "11111111-1111-1111-1111-111111111111",
    );
    const s3 = createInstance({
      routes: { uploads: allFeaturesRoute() },
    });
    await expect(
      s3.api.upload({ body: defaultUploadBody }),
    ).resolves.toMatchObject({
      key: "uploads/11111111-1111-1111-1111-111111111111/a.png",
    });
  });

  it("uses object.prefix when generating the key", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "11111111-1111-1111-1111-111111111111",
    );
    const s3 = createInstance({
      routes: {
        uploads: allFeaturesRoute({
          upload: { object: () => ({ prefix: "media" }) },
        }),
      },
    });
    await expect(
      s3.api.upload({ body: defaultUploadBody }),
    ).resolves.toMatchObject({
      key: "uploads/media/11111111-1111-1111-1111-111111111111/a.png",
    });
  });

  it("locks POST content-length-range to the declared size", async () => {
    const s3 = createInstance();
    await s3.api.upload({ body: defaultUploadBody });
    expect(createPresignedPost).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        Conditions: [["content-length-range", 10, 10]],
      }),
    );
  });

  it("clamps route expiresIn to maxExpiresIn", async () => {
    const s3 = createInstance({
      maxExpiresIn: 60,
      routes: {
        uploads: allFeaturesRoute({ upload: { expiresIn: 600 } }),
      },
    });
    await s3.api.upload({ body: defaultUploadBody });
    expect(createPresignedPost).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ Expires: 60 }),
    );
  });

  it("rejects disallowed file types", async () => {
    const s3 = createInstance({
      routes: {
        uploads: allFeaturesRoute({
          upload: { fileTypes: ["image/*"] },
        }),
      },
    });
    await expect(
      s3.api.upload({
        body: {
          ...defaultUploadBody,
          fileName: "a.exe",
          contentType: "application/octet-stream",
        },
      }),
    ).rejects.toMatchObject({
      code: S3_ERROR_CODES.FILE_TYPE_NOT_ALLOWED.code,
    });
  });

  it("rejects oversized files at presign", async () => {
    const s3 = createInstance({
      routes: {
        uploads: allFeaturesRoute({
          upload: { maxFileSize: 5 },
        }),
      },
    });
    await expect(
      s3.api.upload({ body: defaultUploadBody }),
    ).rejects.toMatchObject({
      code: S3_ERROR_CODES.PAYLOAD_TOO_LARGE.code,
    });
  });

  it("rejects POST uploads over the S3 POST object limit", async () => {
    const s3 = createInstance();
    await expect(
      s3.api.upload({
        body: {
          ...defaultUploadBody,
          fileSize: 5 * 1024 * 1024 * 1024 + 1,
        },
      }),
    ).rejects.toMatchObject({
      code: S3_ERROR_CODES.PAYLOAD_TOO_LARGE.code,
    });
    expect(createPresignedPost).not.toHaveBeenCalled();
  });

  it("does not let s3.api callers replace bound config", async () => {
    const s3 = createInstance();
    await expect(
      s3.api.upload({
        body: defaultUploadBody,
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
      routes: { uploads: allFeaturesRoute({ upload: { onConfirmed } }) },
    });

    await expect(
      s3.api.confirm({ body: { route: "uploads", key: storedPngKey } }),
    ).resolves.toMatchObject({
      key: storedPngKey,
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
    });

    await expect(
      s3.api.confirm({ body: { route: "uploads", key: storedPngKey } }),
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
    });

    await expect(
      s3.api.confirm({
        body: { route: "uploads", key: "uploads/missing.png" },
      }),
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
    });

    await expect(
      s3.api.confirm({ body: { route: "uploads", key: storedPngKey } }),
    ).resolves.toMatchObject({ acl: "private" });
  });

  it("rejects confirm when HeadObject size exceeds maxFileSize", async () => {
    const s3 = createInstance({
      client: mockS3(
        sendByCommand({
          HeadObjectCommand: headResult({ ContentLength: 100 }),
          DeleteObjectCommand: {},
        }) as never,
      ),
      routes: {
        uploads: allFeaturesRoute({ upload: { maxFileSize: 20 } }),
      },
    });

    await expect(
      s3.api.confirm({ body: { route: "uploads", key: storedPngKey } }),
    ).rejects.toMatchObject({
      code: S3_ERROR_CODES.PAYLOAD_TOO_LARGE.code,
    });
  });
});

describe("download / delete", () => {
  it("presigns a download after HeadObject succeeds", async () => {
    const onPresigned = vi.fn();
    const s3 = createInstance({
      client: mockS3(
        sendByCommand({ HeadObjectCommand: headResult() }) as never,
      ),
      routes: { uploads: allFeaturesRoute({ download: { onPresigned } }) },
    });

    await expect(
      s3.api.download({
        query: { route: "uploads", key: storedPngKey, fileName: "save.png" },
      }),
    ).resolves.toMatchObject({
      key: storedPngKey,
      url: "https://s3.test/signed",
    });
    expect(onPresigned).toHaveBeenCalled();
  });

  it("uses download.expiresIn, not upload.expiresIn", async () => {
    vi.mocked(getSignedUrl).mockClear();
    const s3 = createInstance({
      client: mockS3(
        sendByCommand({ HeadObjectCommand: headResult() }) as never,
      ),
      routes: {
        uploads: allFeaturesRoute({
          upload: { expiresIn: 60 },
          download: { expiresIn: 120 },
        }),
      },
    });

    await s3.api.download({
      query: { route: "uploads", key: storedPngKey },
    });
    expect(getSignedUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ expiresIn: 120 }),
    );
  });

  it("defaults download TTL when download.expiresIn is omitted", async () => {
    vi.mocked(getSignedUrl).mockClear();
    const s3 = createInstance({
      client: mockS3(
        sendByCommand({ HeadObjectCommand: headResult() }) as never,
      ),
      routes: {
        uploads: allFeaturesRoute({
          upload: { expiresIn: 60 },
          download: true,
        }),
      },
    });

    await s3.api.download({
      query: { route: "uploads", key: storedPngKey },
    });
    expect(getSignedUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ expiresIn: 600 }),
    );
  });

  it("maps missing objects to OBJECT_NOT_FOUND", async () => {
    const missing = vi.fn(async () => {
      throw Object.assign(new Error("missing"), { name: "NoSuchKey" });
    });
    const s3 = createInstance({
      client: mockS3(missing as never),
    });

    await expect(
      s3.api.download({
        query: { route: "uploads", key: "uploads/missing.png" },
      }),
    ).rejects.toMatchObject({
      code: S3_ERROR_CODES.OBJECT_NOT_FOUND.code,
      status: "NOT_FOUND",
      statusCode: 404,
    });
    await expect(
      s3.api.delete({
        query: { route: "uploads", key: "uploads/missing.png" },
      }),
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
      routes: { uploads: allFeaturesRoute({ delete: { onDeleted } }) },
    });

    await expect(
      s3.api.delete({ query: { route: "uploads", key: storedPngKey } }),
    ).resolves.toEqual({
      success: true,
      bucket: "bucket",
      key: storedPngKey,
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
      plugins: [{ id: "mp", hooks: { upload: { multipart: { onInit } } } }],
    });

    await expect(
      s3.api.multipartInit({ body: defaultUploadBody }),
    ).resolves.toMatchObject({
      bucket: "bucket",
      uploadId: "up-1",
    });
    expect(onInit).toHaveBeenCalled();
  });

  it("runs upload.guard on multipart init", async () => {
    const guard = vi.fn();
    const s3 = createInstance({
      client: mockS3(
        sendByCommand({
          CreateMultipartUploadCommand: { UploadId: "up-1" },
        }) as never,
      ),
      routes: {
        uploads: allFeaturesRoute({ upload: { guard } }),
      },
    });

    await s3.api.multipartInit({ body: defaultUploadBody });
    expect(guard).toHaveBeenCalled();
  });

  it("signs a part", async () => {
    const s3 = createInstance();
    await expect(
      s3.api.multipartPart({
        body: {
          route: "uploads",
          key: storedBinKey,
          uploadId: "up-1",
          partNumber: 1,
          partSize: 8,
        },
      }),
    ).resolves.toMatchObject({
      presignedUrl: "https://s3.test/signed",
      partNumber: 1,
      uploadId: "up-1",
      partSize: 8,
    });
    expect(getSignedUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        input: expect.objectContaining({ ContentLength: 8 }),
      }),
      expect.objectContaining({
        signableHeaders: new Set(["content-length"]),
      }),
    );
  });

  it("rejects a part larger than maxFileSize", async () => {
    vi.mocked(getSignedUrl).mockClear();
    const s3 = createInstance({
      routes: {
        uploads: allFeaturesRoute({ upload: { maxFileSize: 5 } }),
      },
    });
    await expect(
      s3.api.multipartPart({
        body: {
          route: "uploads",
          key: storedBinKey,
          uploadId: "up-1",
          partNumber: 1,
          partSize: 8,
        },
      }),
    ).rejects.toMatchObject({
      code: S3_ERROR_CODES.PAYLOAD_TOO_LARGE.code,
    });
    expect(getSignedUrl).not.toHaveBeenCalled();
  });

  it("rejects a part that would exceed maxFileSize with uploaded parts", async () => {
    const s3 = createInstance({
      client: mockS3(
        sendByCommand({
          ListPartsCommand: {
            Parts: [{ PartNumber: 1, Size: 15, ETag: '"p1"' }],
          },
        }) as never,
      ),
      routes: {
        uploads: allFeaturesRoute({ upload: { maxFileSize: 20 } }),
      },
    });
    await expect(
      s3.api.multipartPart({
        body: {
          route: "uploads",
          key: storedBinKey,
          uploadId: "up-1",
          partNumber: 2,
          partSize: 8,
        },
      }),
    ).rejects.toMatchObject({
      code: S3_ERROR_CODES.PAYLOAD_TOO_LARGE.code,
    });
  });

  it("allows replacing a part when the new size stays under maxFileSize", async () => {
    const s3 = createInstance({
      client: mockS3(
        sendByCommand({
          ListPartsCommand: {
            Parts: [{ PartNumber: 1, Size: 15, ETag: '"p1"' }],
          },
        }) as never,
      ),
      routes: {
        uploads: allFeaturesRoute({ upload: { maxFileSize: 20 } }),
      },
    });
    await expect(
      s3.api.multipartPart({
        body: {
          route: "uploads",
          key: storedBinKey,
          uploadId: "up-1",
          partNumber: 1,
          partSize: 8,
        },
      }),
    ).resolves.toMatchObject({ partSize: 8 });
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
      plugins: [{ id: "mp", hooks: { upload: { multipart: { onList } } } }],
    });

    await expect(
      s3.api.multipartListParts({
        query: { route: "uploads", key: storedBinKey, uploadId: "up-1" },
      }),
    ).resolves.toEqual({
      parts: [{ partNumber: 1, size: 8, eTag: "p1" }],
    });
    expect(onList).toHaveBeenCalled();
  });

  it("completes from listed parts and HeadObject", async () => {
    const onConfirmed = vi.fn();
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
      plugins: [{ id: "mp", hooks: { upload: { onConfirmed } } }],
    });

    await expect(
      s3.api.multipartComplete({
        body: {
          route: "uploads",
          key: storedBinKey,
          uploadId: "up-1",
          parts: [{ partNumber: 1 }],
        },
      }),
    ).resolves.toMatchObject({
      key: storedBinKey,
      uploadId: "up-1",
      contentLength: 8,
      eTag: "abc",
    });
    expect(onConfirmed).toHaveBeenCalled();
  });

  it("rejects complete and aborts when listed part sizes exceed maxFileSize", async () => {
    const send = sendByCommand({
      ListPartsCommand: {
        Parts: [{ PartNumber: 1, ETag: '"p1"', Size: 100 }],
      },
      AbortMultipartUploadCommand: {},
    });
    const s3 = createInstance({
      client: mockS3(send as never),
      routes: {
        uploads: allFeaturesRoute({ upload: { maxFileSize: 20 } }),
      },
    });

    await expect(
      s3.api.multipartComplete({
        body: {
          route: "uploads",
          key: storedBinKey,
          uploadId: "up-1",
          parts: [{ partNumber: 1 }],
        },
      }),
    ).rejects.toMatchObject({
      code: S3_ERROR_CODES.PAYLOAD_TOO_LARGE.code,
    });
    expect(send).toHaveBeenCalledWith(expect.any(AbortMultipartUploadCommand));
    expect(send).not.toHaveBeenCalledWith(
      expect.any(CompleteMultipartUploadCommand),
    );
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
    });

    await expect(
      s3.api.multipartComplete({
        body: {
          route: "uploads",
          key: storedBinKey,
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
    });

    await expect(
      s3.api.multipartListParts({
        query: { route: "uploads", key: storedBinKey, uploadId: "up-1" },
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
    });

    await expect(
      s3.api.multipartComplete({
        body: {
          route: "uploads",
          key: storedBinKey,
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
    });

    await expect(
      s3.api.multipartAbort({
        body: { route: "uploads", key: storedBinKey, uploadId: "gone" },
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
      plugins: [{ id: "mp", hooks: { upload: { multipart: { onAbort } } } }],
    });

    await expect(
      s3.api.multipartAbort({
        body: { route: "uploads", key: storedBinKey, uploadId: "up-1" },
      }),
    ).resolves.toEqual({
      aborted: true,
      bucket: "bucket",
      key: storedBinKey,
      uploadId: "up-1",
    });
    expect(onAbort).toHaveBeenCalled();
  });

  it("requires partSize when signing a part", async () => {
    const s3 = createInstance();
    await expect(
      s3.api.multipartPart({
        body: {
          route: "uploads",
          key: storedBinKey,
          uploadId: "up-1",
          partNumber: 1,
        } as never,
      }),
    ).rejects.toMatchObject({
      code: S3_ERROR_CODES.VALIDATION_ERROR.code,
      statusCode: 400,
    });
  });
});

describe("key namespace", () => {
  it("rejects follow-up keys outside the route prefix", async () => {
    const s3 = createInstance({
      client: mockS3(
        sendByCommand({ HeadObjectCommand: headResult() }) as never,
      ),
    });

    await expect(
      s3.api.confirm({
        body: { route: "uploads", key: "avatars/a.png" },
      }),
    ).rejects.toMatchObject({
      code: S3_ERROR_CODES.INVALID_KEY.code,
      statusCode: 400,
    });
    await expect(
      s3.api.download({
        query: { route: "uploads", key: "avatars/a.png" },
      }),
    ).rejects.toMatchObject({
      code: S3_ERROR_CODES.INVALID_KEY.code,
    });
  });

  it("allows keys anywhere in the bucket when keyPrefix is false", async () => {
    const s3 = createInstance({
      client: mockS3(
        sendByCommand({ HeadObjectCommand: headResult() }) as never,
      ),
      routes: {
        uploads: allFeaturesRoute({ keyPrefix: false }),
      },
    });

    await expect(
      s3.api.confirm({ body: { route: "uploads", key: "a.png" } }),
    ).resolves.toMatchObject({ key: "a.png" });
  });
});

describe("feature guards", () => {
  it("runs upload.guard after the global guard", async () => {
    const order: string[] = [];
    const s3 = createInstance({
      guard: () => {
        order.push("global");
      },
      routes: {
        uploads: allFeaturesRoute({
          upload: {
            guard: () => {
              order.push("presign");
            },
          },
        }),
      },
    });

    await s3.api.upload({ body: defaultUploadBody });
    expect(order).toEqual(["global", "presign"]);
  });
});
