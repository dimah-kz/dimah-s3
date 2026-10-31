import { Readable } from "node:stream";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import {
  buildContentDisposition,
  S3_MAX_POST_OBJECT_BYTES,
  s3Error,
} from "@dimah-s3/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  memoryS3,
  TEST_BUCKET,
  testConfig,
  testRoute,
  testUpload,
  type MemoryS3,
} from "@/test/harness";
import type { PutInput, UploadOnStartContext } from "@/types";
import type { ResolvedConfig, ResolvedUpload } from "@/types/resolved";
import { putObject } from "./put";

const NOW = new Date("2026-01-01T00:00:00.000Z");
const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d,
]);
const input: PutInput = {
  route: "uploads",
  name: "a.txt",
  type: "text/plain",
  body: "hello",
};

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

function putCommand(s3: MemoryS3): PutObjectCommand | undefined {
  return s3.send.mock.calls
    .map(([command]) => command)
    .find((command) => command instanceof PutObjectCommand);
}

function text(bytes: Uint8Array | undefined): string {
  return new TextDecoder().decode(bytes);
}

afterEach(() => {
  vi.useRealTimers();
});

describe("putObject", () => {
  it("writes the body with the marker and disposition, then confirms it", async () => {
    const { s3, config } = setup();
    const result = await putObject(config, input);

    expect(result).toEqual({
      key: expect.stringMatching(/^uploads\/[\da-f-]{36}\/a\.txt$/),
      bucket: TEST_BUCKET,
      name: "a.txt",
      size: 5,
      type: "text/plain",
      eTag: expect.any(String),
      lastModified: expect.any(String),
      metadata: {},
      acl: "private",
    });
    expect(putCommand(s3)?.input).toMatchObject({
      Bucket: TEST_BUCKET,
      Key: result.key,
      ContentLength: 5,
      ContentType: "text/plain",
      ContentDisposition: buildContentDisposition("a.txt"),
      ACL: "private",
      Metadata: { "dimah-upload": expect.any(String) },
    });
    expect(text(s3.get(result.key)?.body)).toBe("hello");
  });

  it("defaults the content type to application/octet-stream", async () => {
    const { s3, config } = setup();
    await putObject(config, { ...input, type: undefined });
    expect(putCommand(s3)?.input.ContentType).toBe("application/octet-stream");
  });

  it.each([
    ["Uint8Array", () => new TextEncoder().encode("hello"), false],
    ["ArrayBuffer", () => new TextEncoder().encode("hello").buffer, false],
    ["Blob", () => new Blob(["hello"]), true],
  ] as const)("accepts a %s body", async (_, makeBody, streamed) => {
    const { s3, config } = setup();
    const result = await putObject(config, { ...input, body: makeBody() });

    expect(result.size).toBe(5);
    expect(text(s3.get(result.key)?.body)).toBe("hello");
    expect(putCommand(s3)?.input.Body instanceof Readable).toBe(streamed);
  });

  it("streams a ReadableStream body as a Node stream to the Node handler", async () => {
    const { s3, config } = setup();
    const result = await putObject(config, {
      ...input,
      body: new Blob(["hello"]).stream(),
      size: 5,
    });

    expect(putCommand(s3)?.input.Body).toBeInstanceOf(Readable);
    expect(text(s3.get(result.key)?.body)).toBe("hello");
  });

  it("writes call metadata over object() metadata, and never client metadata", async () => {
    const object = vi.fn(() => ({
      metadata: { source: "import", owner: "route" },
    }));
    const guard = vi.fn();
    const { s3, config } = setup({ object, guard: [{ hook: guard }] });
    const result = await putObject(config, {
      ...input,
      metadata: { owner: "caller" },
      clientMetadata: { folder: "docs" },
    });

    expect(object).toHaveBeenCalledWith(
      expect.objectContaining({ clientMetadata: { folder: "docs" } }),
    );
    expect(guard).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { source: "import", owner: "caller" },
        clientMetadata: { folder: "docs" },
      }),
    );
    expect(putCommand(s3)?.input.Metadata).toEqual({
      source: "import",
      owner: "caller",
      "dimah-upload": expect.any(String),
    });
    expect(result.metadata).toEqual({ source: "import", owner: "caller" });
  });

  it("applies object() storage class, cache control, tagging and ACL", async () => {
    const { s3, config } = setup({
      object: () => ({
        storageClass: "STANDARD_IA",
        cacheControl: "max-age=3600",
        tagging: { env: "prod" },
        acl: "public-read",
      }),
    });
    const result = await putObject(config, input);

    expect(putCommand(s3)?.input).toMatchObject({
      StorageClass: "STANDARD_IA",
      CacheControl: "max-age=3600",
      Tagging: "env=prod",
      ACL: "public-read",
    });
    expect(result.acl).toBe("public-read");
  });
});

describe("putObject input", () => {
  it.each([
    [
      "a ReadableStream without size",
      { body: new Blob(["hello"]).stream() },
      /size is required/,
    ],
    ["a size that does not match the body", { size: 4 }, /size is 4/],
    ["an empty name", { name: " " }, /^s3\.put: name: /],
  ] satisfies [string, Partial<PutInput>, RegExp][])(
    "rejects %s",
    async (_, overrides, issue) => {
      const { s3, config } = setup();
      await expect(
        putObject(config, { ...input, ...overrides }),
      ).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
        statusCode: 400,
        params: { issue: expect.stringMatching(issue) },
      });
      expect(s3.send).not.toHaveBeenCalled();
    },
  );

  it("rejects an empty body with FILE_EMPTY", async () => {
    const { s3, config } = setup();
    await expect(
      putObject(config, { ...input, body: "" }),
    ).rejects.toMatchObject({ code: "FILE_EMPTY", statusCode: 400 });
    expect(s3.send).not.toHaveBeenCalled();
  });

  it("rejects a body over the 5 GiB single-request limit", async () => {
    const { s3, config } = setup();
    const size = S3_MAX_POST_OBJECT_BYTES + 1;
    await expect(
      putObject(config, { ...input, body: new ReadableStream(), size }),
    ).rejects.toMatchObject({
      code: "FILE_TOO_LARGE",
      params: { size, maxFileSize: S3_MAX_POST_OBJECT_BYTES },
    });
    expect(s3.send).not.toHaveBeenCalled();
  });

  it("checks the route limits", async () => {
    const { config } = setup({ fileTypes: ["image/*"] });
    await expect(putObject(config, input)).rejects.toMatchObject({
      code: "FILE_TYPE_NOT_ALLOWED",
    });
    await expect(
      putObject(config, { ...input, route: "nope" }),
    ).rejects.toMatchObject({ code: "UNKNOWN_ROUTE" });
  });
});

describe("putObject hooks", () => {
  it("runs onStart with kind server and a 15-minute deadline before PutObject", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const { s3, config } = setup();
    const onStart = vi.fn<(context: UploadOnStartContext) => void>(() => {
      expect(s3.send).not.toHaveBeenCalled();
    });
    config.routes.uploads.upload = testUpload({ onStart: [{ hook: onStart }] });

    await putObject(config, input);
    const context = onStart.mock.calls[0][0];
    expect(context).toMatchObject({
      operation: "put",
      kind: "server",
      file: { name: "a.txt", size: 5, type: "text/plain" },
      uploadToken: putCommand(s3)?.input.Metadata?.["dimah-upload"],
      expiresAt: new Date(NOW.getTime() + 15 * 60 * 1000),
    });
    expect(context.url).toBeUndefined();
    expect(context.urlExpiresAt).toBeUndefined();
  });

  it("skips PutObject when onStart throws", async () => {
    const { s3, config } = setup({
      onStart: [
        {
          plugin: "db",
          hook: () => {
            throw s3Error("QUOTA_EXCEEDED", { limit: "files" });
          },
        },
      ],
    });
    await expect(putObject(config, input)).rejects.toMatchObject({
      code: "QUOTA_EXCEEDED",
    });
    expect(s3.send).not.toHaveBeenCalled();
  });

  it("seeds guards with options.locals and skips PutObject on a rejection", async () => {
    const guard = vi.fn(({ locals }: { locals: object }) => {
      if (!("userId" in locals)) throw s3Error("UNAUTHORIZED");
    });
    const { s3, config } = setup({ guard: [{ hook: guard }] });

    await expect(putObject(config, input)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(s3.send).not.toHaveBeenCalled();

    await putObject(config, input, { locals: { userId: "u1" } });
    expect(guard).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: "server", operation: "put" }),
    );
  });

  it("runs onConfirmed with kind server and skips confirmGuard", async () => {
    const confirmGuard = vi.fn();
    const onConfirmed = vi.fn();
    const { s3, config } = setup({
      confirmGuard: [{ hook: confirmGuard }],
      onConfirmed: [{ hook: onConfirmed }],
    });
    const result = await putObject(config, input);

    expect(confirmGuard).not.toHaveBeenCalled();
    expect(onConfirmed).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "put",
        kind: "server",
        key: result.key,
        uploadToken: putCommand(s3)?.input.Metadata?.["dimah-upload"],
        object: expect.objectContaining({ size: 5, type: "text/plain" }),
      }),
    );
  });

  it("deletes the object when a plugin onConfirmed throws", async () => {
    const { s3, config } = setup({
      onConfirmed: [
        {
          plugin: "db",
          hook: () => {
            throw s3Error("QUOTA_EXCEEDED", { limit: "bytes" });
          },
        },
      ],
    });
    await expect(putObject(config, input)).rejects.toMatchObject({
      code: "QUOTA_EXCEEDED",
    });
    expect(s3.objects.size).toBe(0);
  });

  it("keeps the object and returns 500 when the user onConfirmed throws", async () => {
    const { s3, config } = setup({
      onConfirmed: [
        {
          hook: () => {
            throw new Error("webhook failed");
          },
        },
      ],
    });
    await expect(putObject(config, input)).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
      statusCode: 500,
    });
    expect(s3.objects.size).toBe(1);
  });

  it("verifies content with verifyContent and deletes a mismatch", async () => {
    const { s3, config } = setup({ checksum: true, verifyContent: true });
    await expect(
      putObject(config, {
        ...input,
        name: "a.png",
        type: "image/png",
        body: PNG,
      }),
    ).resolves.toMatchObject({ type: "image/png" });

    await expect(
      putObject(config, { ...input, name: "b.png", type: "image/png" }),
    ).rejects.toMatchObject({ code: "FILE_CONTENT_MISMATCH" });
    expect(s3.objects.size).toBe(1);
  });
});
