import { S3Client } from "@aws-sdk/client-s3";
import { sha256Base64 } from "@dimah-s3/core";
import { describe, expect, it, vi } from "vitest";
import { assertChecksumConfig } from "@/helpers/checksum-config";
import { ConfigError } from "@/helpers/error-boundary";
import { memoryS3, mockS3, TEST_BUCKET } from "@/test/harness";
import {
  presignPut,
  presignUploadPart,
  type PresignPutInput,
} from "./presign-put";

const body = new TextEncoder().encode("0123456789");

async function putInput(
  overrides: Partial<PresignPutInput> = {},
): Promise<PresignPutInput> {
  return {
    bucket: TEST_BUCKET,
    key: "uploads/abc/a.png",
    size: body.length,
    contentType: "image/png",
    contentDisposition: 'attachment; filename="a.png"',
    metadata: { "dimah-upload": "token-1", author: "=?UTF-8?B?w6k=?=" },
    acl: "private",
    checksum: await sha256Base64(body),
    expiresIn: 600,
    ...overrides,
  };
}

function signedHeaders(url: string): string[] {
  return new URL(url).searchParams.get("X-Amz-SignedHeaders")?.split(";") ?? [];
}

function sdkClient(options: ConstructorParameters<typeof S3Client>[0] = {}) {
  return new S3Client({
    region: "us-east-1",
    endpoint: "https://s3.test",
    forcePathStyle: true,
    credentials: { accessKeyId: "test", secretAccessKey: "test" },
    requestChecksumCalculation: "WHEN_REQUIRED",
    ...options,
  });
}

describe("presignPut", () => {
  it("signs x-amz-meta-* and checksum headers instead of putting them in the query", async () => {
    const { url } = await presignPut(memoryS3().client, await putInput());
    const query = new URL(url).searchParams;

    expect(signedHeaders(url)).toEqual([
      "content-disposition",
      "content-length",
      "content-type",
      "host",
      "x-amz-acl",
      "x-amz-checksum-sha256",
      "x-amz-meta-author",
      "x-amz-meta-dimah-upload",
    ]);
    for (const name of query.keys()) {
      expect(name.toLowerCase()).not.toMatch(
        /^x-amz-(meta-|acl|checksum|tagging|storage-class)/,
      );
    }
  });

  it("returns the signed headers without content-length or host", async () => {
    const input = await putInput();
    const { headers } = await presignPut(memoryS3().client, input);

    expect(headers).toEqual({
      "content-type": "image/png",
      "content-disposition": 'attachment; filename="a.png"',
      "x-amz-acl": "private",
      "x-amz-meta-dimah-upload": "token-1",
      "x-amz-meta-author": "=?UTF-8?B?w6k=?=",
      "x-amz-checksum-sha256": input.checksum,
    });
  });

  it("signs cache-control, storage class and tagging from object()", async () => {
    const { url, headers } = await presignPut(
      memoryS3().client,
      await putInput({
        cacheControl: "max-age=60",
        storageClass: "STANDARD_IA",
        tagging: { env: "test", team: "a b" },
      }),
    );

    expect(signedHeaders(url)).toEqual(
      expect.arrayContaining([
        "cache-control",
        "x-amz-storage-class",
        "x-amz-tagging",
      ]),
    );
    expect(headers).toMatchObject({
      "cache-control": "max-age=60",
      "x-amz-storage-class": "STANDARD_IA",
      "x-amz-tagging": "env=test&team=a%20b",
    });
  });

  it("omits the checksum header when there is no checksum", async () => {
    const { url, headers } = await presignPut(
      memoryS3().client,
      await putInput({ checksum: undefined }),
    );

    expect(signedHeaders(url)).not.toContain("x-amz-checksum-sha256");
    expect(headers).not.toHaveProperty("x-amz-checksum-sha256");
  });

  it("signs the exact body size and the URL TTL", async () => {
    const { url } = await presignPut(
      memoryS3().client,
      await putInput({ expiresIn: 120 }),
    );

    expect(signedHeaders(url)).toContain("content-length");
    expect(new URL(url).searchParams.get("X-Amz-Expires")).toBe("120");
  });

  it("produces headers that S3 accepts as the upload", async () => {
    const s3 = memoryS3();
    const input = await putInput();
    const { headers } = await presignPut(s3.client, input);

    const object = await s3.receiveUpload({ key: input.key, body, headers });
    expect(object).toMatchObject({
      contentType: "image/png",
      metadata: { "dimah-upload": "token-1", author: "=?UTF-8?B?w6k=?=" },
      checksum: input.checksum,
    });
  });

  it("throws when the SDK signs a header it was not given", async () => {
    const client = sdkClient();
    client.middlewareStack.add(
      (next) => (args) => {
        (args.request as { headers: Record<string, string> }).headers[
          "x-extra"
        ] = "1";
        return next(args);
      },
      { step: "build" },
    );

    await expect(presignPut(client, await putInput())).rejects.toThrow(
      /signs ".*x-extra.*"; expected/,
    );
  });
});

describe("presignUploadPart", () => {
  it("signs the part size and checksum", async () => {
    const checksum = await sha256Base64(body);
    const { url, headers } = await presignUploadPart(memoryS3().client, {
      bucket: TEST_BUCKET,
      key: "uploads/abc/movie.mp4",
      uploadId: "upload-1",
      partNumber: 2,
      size: 5_242_880,
      checksum,
      expiresIn: 600,
    });
    const query = new URL(url).searchParams;

    expect(signedHeaders(url)).toEqual([
      "content-length",
      "host",
      "x-amz-checksum-sha256",
    ]);
    expect(query.get("partNumber")).toBe("2");
    expect(query.get("uploadId")).toBe("upload-1");
    expect(headers).toEqual({ "x-amz-checksum-sha256": checksum });
  });

  it("returns no headers without a checksum", async () => {
    const { url, headers } = await presignUploadPart(memoryS3().client, {
      bucket: TEST_BUCKET,
      key: "uploads/abc/movie.mp4",
      uploadId: "upload-1",
      partNumber: 1,
      size: 5_242_880,
      expiresIn: 600,
    });

    expect(signedHeaders(url)).toEqual(["content-length", "host"]);
    expect(headers).toEqual({});
  });
});

describe("flexible checksum config", () => {
  it("rejects a client with WHEN_SUPPORTED as a config error, then a plain 500", async () => {
    const client = sdkClient({ requestChecksumCalculation: "WHEN_SUPPORTED" });
    const input = await putInput();

    const first = presignPut(client, input);
    await expect(first).rejects.toBeInstanceOf(ConfigError);
    await expect(first).rejects.toThrow(/requestChecksumCalculation/);

    await expect(presignPut(client, input)).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
      statusCode: 500,
      cause: expect.any(ConfigError),
    });
  });

  it("checks the SDK default, which is WHEN_SUPPORTED", async () => {
    const client = sdkClient({ requestChecksumCalculation: undefined });
    await expect(assertChecksumConfig(client)).rejects.toBeInstanceOf(
      ConfigError,
    );
  });

  it("reads the option once per client", async () => {
    const requestChecksumCalculation = vi.fn(async () => "WHEN_REQUIRED");
    const client = {
      config: { requestChecksumCalculation },
    } as unknown as S3Client;

    await assertChecksumConfig(client);
    await assertChecksumConfig(client);
    expect(requestChecksumCalculation).toHaveBeenCalledOnce();
  });

  it("passes an SDK without the option", async () => {
    const client = mockS3();
    (client as { config: object }).config = {};
    await expect(assertChecksumConfig(client)).resolves.toBeUndefined();
  });
});
