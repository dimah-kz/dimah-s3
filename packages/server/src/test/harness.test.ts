import {
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListPartsCommand,
  PutObjectCommand,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { sha256Base64 } from "@dimah-s3/core";
import { describe, expect, it } from "vitest";
import { memoryS3, TEST_BUCKET } from "./harness";

const Bucket = TEST_BUCKET;
const Key = "uploads/a.txt";

describe("memoryS3", () => {
  it("stores, heads and reads an object", async () => {
    const s3 = memoryS3();
    await s3.client.send(
      new PutObjectCommand({
        Bucket,
        Key,
        Body: "hello",
        ContentType: "text/plain",
        Metadata: { "Dimah-Upload": "token" },
      }),
    );

    const head = await s3.client.send(new HeadObjectCommand({ Bucket, Key }));
    expect(head).toMatchObject({
      ContentLength: 5,
      ContentType: "text/plain",
      Metadata: { "dimah-upload": "token" },
    });
    const get = await s3.client.send(new GetObjectCommand({ Bucket, Key }));
    await expect(get.Body?.transformToString()).resolves.toBe("hello");
    expect(get.$metadata.httpStatusCode).toBe(200);
  });

  it("reports missing objects as S3 does", async () => {
    const s3 = memoryS3();
    await expect(
      s3.client.send(new HeadObjectCommand({ Bucket, Key })),
    ).rejects.toMatchObject({
      name: "NotFound",
      $metadata: { httpStatusCode: 404 },
    });
    await expect(
      s3.client.send(new GetObjectCommand({ Bucket, Key })),
    ).rejects.toMatchObject({ name: "NoSuchKey" });
  });

  it("rejects non-ASCII metadata but keeps RFC 2047 values as sent", async () => {
    const s3 = memoryS3();
    await expect(
      s3.client.send(
        new PutObjectCommand({ Bucket, Key, Body: "x", Metadata: { n: "é" } }),
      ),
    ).rejects.toThrow(TypeError);

    const encoded = "=?UTF-8?B?w6k=?=";
    await s3.client.send(
      new PutObjectCommand({
        Bucket,
        Key,
        Body: "x",
        Metadata: { n: encoded },
      }),
    );
    expect(s3.get(Key)?.metadata).toEqual({ n: encoded });
  });

  it("rejects metadata over 2 KB", async () => {
    const s3 = memoryS3();
    await expect(
      s3.client.send(
        new PutObjectCommand({
          Bucket,
          Key,
          Body: "x",
          Metadata: { big: "a".repeat(2048) },
        }),
      ),
    ).rejects.toMatchObject({ name: "MetadataTooLarge" });
  });

  it("checks a SHA-256 checksum and returns it with ChecksumMode", async () => {
    const s3 = memoryS3();
    const body = new TextEncoder().encode("hello");
    const checksum = await sha256Base64(body);
    await expect(
      s3.client.send(
        new PutObjectCommand({
          Bucket,
          Key,
          Body: body,
          ChecksumSHA256: "AAAA",
        }),
      ),
    ).rejects.toMatchObject({ name: "BadDigest" });

    await s3.client.send(
      new PutObjectCommand({
        Bucket,
        Key,
        Body: body,
        ChecksumSHA256: checksum,
      }),
    );
    await expect(
      s3.client.send(
        new HeadObjectCommand({ Bucket, Key, ChecksumMode: "ENABLED" }),
      ),
    ).resolves.toMatchObject({ ChecksumSHA256: checksum });
  });

  describe("ranged and conditional GetObject", () => {
    async function seeded() {
      const s3 = memoryS3();
      const object = s3.seed(Key, "0123456789", {
        lastModified: new Date("2026-01-01T00:00:00Z"),
      });
      const get = (input: Omit<GetObjectCommand["input"], "Bucket" | "Key">) =>
        s3.client.send(new GetObjectCommand({ Bucket, Key, ...input }));
      return { object, get };
    }

    it.each([
      ["bytes=2-4", "234", "bytes 2-4/10"],
      ["bytes=7-", "789", "bytes 7-9/10"],
      ["bytes=-3", "789", "bytes 7-9/10"],
      ["bytes=8-20", "89", "bytes 8-9/10"],
    ])("serves %s", async (Range, body, contentRange) => {
      const { get } = await seeded();
      const result = await get({ Range });
      await expect(result.Body?.transformToString()).resolves.toBe(body);
      expect(result.ContentRange).toBe(contentRange);
      expect(result.$metadata.httpStatusCode).toBe(206);
    });

    it("ignores a multi-range header", async () => {
      const { get } = await seeded();
      const result = await get({ Range: "bytes=0-1,4-5" });
      expect(result.ContentLength).toBe(10);
      expect(result.ContentRange).toBeUndefined();
    });

    it("returns 416 for an unsatisfiable range", async () => {
      const { get } = await seeded();
      await expect(get({ Range: "bytes=10-" })).rejects.toMatchObject({
        name: "InvalidRange",
        $metadata: { httpStatusCode: 416 },
      });
    });

    it("returns 304 for a matching If-None-Match or an old If-Modified-Since", async () => {
      const { object, get } = await seeded();
      await expect(get({ IfNoneMatch: object.eTag })).rejects.toMatchObject({
        $metadata: { httpStatusCode: 304 },
      });
      await expect(
        get({ IfModifiedSince: new Date("2026-02-01T00:00:00Z") }),
      ).rejects.toMatchObject({ name: "NotModified" });
      await expect(
        get({ IfModifiedSince: new Date("2025-12-01T00:00:00Z") }),
      ).resolves.toMatchObject({ ContentLength: 10 });
    });

    it("returns 412 for a failed If-Match", async () => {
      const { get } = await seeded();
      await expect(get({ IfMatch: '"other"' })).rejects.toMatchObject({
        name: "PreconditionFailed",
        $metadata: { httpStatusCode: 412 },
      });
    });

    it("honors the abort signal", async () => {
      const s3 = memoryS3();
      s3.seed(Key, "x");
      const controller = new AbortController();
      controller.abort(new DOMException("gone", "AbortError"));
      await expect(
        s3.client.send(new GetObjectCommand({ Bucket, Key }), {
          abortSignal: controller.signal,
        }),
      ).rejects.toMatchObject({ name: "AbortError" });
    });
  });

  it("deletes many keys and reports per-key errors", async () => {
    const s3 = memoryS3();
    s3.seed("uploads/a", "a");
    s3.seed("uploads/b", "b");
    s3.deleteErrors.set("uploads/b", { Code: "AccessDenied", Message: "no" });

    const result = await s3.client.send(
      new DeleteObjectsCommand({
        Bucket,
        Delete: { Objects: [{ Key: "uploads/a" }, { Key: "uploads/b" }] },
      }),
    );
    expect(result.Deleted).toEqual([{ Key: "uploads/a" }]);
    expect(result.Errors).toEqual([
      { Key: "uploads/b", Code: "AccessDenied", Message: "no" },
    ]);
    expect(s3.get("uploads/a")).toBeUndefined();
    expect(s3.get("uploads/b")).toBeDefined();
  });

  it("runs a multipart upload with paginated ListParts", async () => {
    const s3 = memoryS3();
    const { UploadId } = await s3.client.send(
      new CreateMultipartUploadCommand({
        Bucket,
        Key,
        ContentType: "text/plain",
        ChecksumAlgorithm: "SHA256",
      }),
    );
    for (const [PartNumber, Body] of [
      [1, "ab"],
      [2, "cd"],
      [3, "e"],
    ] as const) {
      await s3.client.send(
        new UploadPartCommand({
          Bucket,
          Key,
          UploadId,
          PartNumber,
          Body,
          ChecksumSHA256: await sha256Base64(new TextEncoder().encode(Body)),
        }),
      );
    }

    const first = await s3.client.send(
      new ListPartsCommand({ Bucket, Key, UploadId, MaxParts: 2 }),
    );
    expect(first.Parts?.map((part) => part.PartNumber)).toEqual([1, 2]);
    expect(first).toMatchObject({
      IsTruncated: true,
      NextPartNumberMarker: "2",
    });
    const second = await s3.client.send(
      new ListPartsCommand({
        Bucket,
        Key,
        UploadId,
        PartNumberMarker: first.NextPartNumberMarker,
      }),
    );
    expect(second.Parts).toMatchObject([{ PartNumber: 3, Size: 1 }]);

    const parts = [...(first.Parts ?? []), ...(second.Parts ?? [])];
    const complete = await s3.client.send(
      new CompleteMultipartUploadCommand({
        Bucket,
        Key,
        UploadId,
        MultipartUpload: {
          Parts: parts.map(({ PartNumber, ETag }) => ({ PartNumber, ETag })),
        },
      }),
    );
    expect(complete.ETag).toMatch(/-3"$/);
    expect(new TextDecoder().decode(s3.get(Key)?.body)).toBe("abcde");
    expect(s3.get(Key)?.checksum).toMatch(/-3$/);
    expect(s3.uploads.size).toBe(0);
  });

  it("receives a presigned upload from its headers", async () => {
    const s3 = memoryS3();
    const object = await s3.receiveUpload({
      key: Key,
      body: "hi",
      headers: {
        "Content-Type": "text/plain",
        "x-amz-meta-dimah-upload": "token",
        "x-amz-checksum-sha256": await sha256Base64(
          new TextEncoder().encode("hi"),
        ),
      },
    });
    expect(object).toMatchObject({
      contentType: "text/plain",
      metadata: { "dimah-upload": "token" },
    });
  });

  it("is a real S3Client that presigners can sign with", async () => {
    const s3 = memoryS3();
    const url = await getSignedUrl(
      s3.client,
      new PutObjectCommand({ Bucket, Key }),
    );
    expect(new URL(url).origin).toBe("https://s3.test");
    expect(url).toContain("X-Amz-Signature=");
  });
});
