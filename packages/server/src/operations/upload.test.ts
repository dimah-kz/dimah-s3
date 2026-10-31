import {
  buildContentDisposition,
  isAPIError,
  S3_MAX_POST_OBJECT_BYTES,
  s3Error,
  sha256Base64,
  type UploadPresignResponse,
} from "@dimah-s3/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfigError } from "@/helpers/error-boundary";
import { resolveRoutes } from "@/helpers/features";
import {
  defaultUploadBody,
  memoryS3,
  TEST_BUCKET,
  testConfig,
  testRoute,
  testUpload,
} from "@/test/harness";
import type { UploadOnStartContext } from "@/types";
import type { ResolvedConfig, ResolvedUpload } from "@/types/resolved";
import { confirmUpload } from "./confirm";
import { presignUpload } from "./upload";

const NOW = new Date("2026-01-01T00:00:00.000Z");
const body = new TextEncoder().encode("0123456789");

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

function signedHeaders(url: string): string[] {
  return new URL(url).searchParams.get("X-Amz-SignedHeaders")?.split(";") ?? [];
}

function policyConditions(fields: Record<string, string>): unknown[] {
  const policy = JSON.parse(atob(fields.Policy)) as { conditions: unknown[] };
  return policy.conditions;
}

/** What S3 does with the presigned request: PUT headers or POST fields. */
function sendUpload(
  s3: ReturnType<typeof memoryS3>,
  presigned: UploadPresignResponse,
  bytes: Uint8Array = body,
) {
  return s3.receiveUpload({
    key: presigned.key,
    body: bytes,
    headers: presigned.method === "PUT" ? presigned.headers : presigned.fields,
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("presignUpload with PUT", () => {
  it("signs the size, type, disposition, ACL and marker into the URL", async () => {
    const { config } = setup();
    const presigned = await presignUpload(config, defaultUploadBody);

    expect(presigned).toMatchObject({
      method: "PUT",
      bucket: TEST_BUCKET,
      expiresIn: 600,
      ticket: expect.stringMatching(/^v1\./),
    });
    expect(presigned.key).toMatch(/^uploads\/[\da-f-]{36}\/a\.png$/);
    if (presigned.method !== "PUT") throw new Error("expected PUT");
    expect(presigned.headers).toEqual({
      "content-type": "image/png",
      "content-disposition": buildContentDisposition("a.png"),
      "x-amz-acl": "private",
      "x-amz-meta-dimah-upload": expect.any(String),
    });
    expect(signedHeaders(presigned.url)).toEqual([
      "content-disposition",
      "content-length",
      "content-type",
      "host",
      "x-amz-acl",
      "x-amz-meta-dimah-upload",
    ]);
  });

  it("defaults the content type to application/octet-stream", async () => {
    const { config } = setup();
    const presigned = await presignUpload(config, {
      ...defaultUploadBody,
      type: undefined,
    });
    if (presigned.method !== "PUT") throw new Error("expected PUT");
    expect(presigned.headers["content-type"]).toBe("application/octet-stream");
  });

  it("signs object() S3 headers and checksum, and S3 rejects other bytes", async () => {
    const checksum = await sha256Base64(body);
    const { s3, config } = setup({
      object: () => ({
        storageClass: "STANDARD_IA",
        cacheControl: "max-age=3600",
        tagging: { env: "prod" },
        acl: "public-read",
      }),
    });
    const presigned = await presignUpload(config, {
      ...defaultUploadBody,
      checksum,
    });

    if (presigned.method !== "PUT") throw new Error("expected PUT");
    expect(presigned.headers).toMatchObject({
      "cache-control": "max-age=3600",
      "x-amz-storage-class": "STANDARD_IA",
      "x-amz-tagging": "env=prod",
      "x-amz-acl": "public-read",
      "x-amz-checksum-sha256": checksum,
    });
    await expect(
      sendUpload(s3, presigned, new TextEncoder().encode("9876543210")),
    ).rejects.toMatchObject({ name: "BadDigest" });
    await expect(sendUpload(s3, presigned)).resolves.toMatchObject({
      storageClass: "STANDARD_IA",
      cacheControl: "max-age=3600",
      tagging: "env=prod",
    });
  });
});

describe("presignUpload with POST", () => {
  it("returns form fields whose policy pins the size and the marker", async () => {
    const { config } = setup({ method: "POST" });
    const presigned = await presignUpload(config, defaultUploadBody);

    if (presigned.method !== "POST") throw new Error("expected POST");
    const marker = presigned.fields["x-amz-meta-dimah-upload"];
    expect(marker).toEqual(expect.any(String));
    expect(presigned.fields).toMatchObject({
      key: presigned.key,
      acl: "private",
      "Content-Type": "image/png",
      "Content-Disposition": buildContentDisposition("a.png"),
    });
    expect(policyConditions(presigned.fields)).toEqual(
      expect.arrayContaining([
        ["content-length-range", 10, 10],
        { "x-amz-meta-dimah-upload": marker },
        { "Content-Type": "image/png" },
        { key: presigned.key },
        ["eq", "$key", presigned.key],
      ]),
    );
    expect(presigned.fields).not.toHaveProperty("x-amz-checksum-sha256");
  });

  it("keeps the ${filename} placeholder out of a generated key", async () => {
    const { config } = setup({ method: "POST" });
    const presigned = await presignUpload(config, {
      ...defaultUploadBody,
      name: "${filename}",
    });

    if (presigned.method !== "POST") throw new Error("expected POST");
    expect(presigned.key).toMatch(/^uploads\/[\da-f-]{36}\/_\{filename\}$/);
    const conditions = policyConditions(presigned.fields);
    expect(conditions).toContainEqual(["eq", "$key", presigned.key]);
    expect(conditions).not.toContainEqual(
      expect.arrayContaining(["starts-with", "$key"]),
    );
  });

  it.each([{ key: "a/${filename}" }, { keyFolder: "a${filename}" }])(
    "rejects an object() key with the ${filename} placeholder: %o",
    async (info) => {
      const { s3, config } = setup({ method: "POST", object: () => info });
      await expect(
        presignUpload(config, defaultUploadBody),
      ).rejects.toMatchObject({ code: "KEY_INVALID", statusCode: 400 });
      expect(s3.send).not.toHaveBeenCalled();
    },
  );

  it("adds the checksum fields with eq conditions", async () => {
    const checksum = await sha256Base64(body);
    const { config } = setup({ method: "POST", checksum: true });
    const presigned = await presignUpload(config, {
      ...defaultUploadBody,
      checksum,
    });

    if (presigned.method !== "POST") throw new Error("expected POST");
    expect(presigned.fields).toMatchObject({
      "x-amz-checksum-algorithm": "SHA256",
      "x-amz-checksum-sha256": checksum,
    });
    expect(policyConditions(presigned.fields)).toEqual(
      expect.arrayContaining([
        ["eq", "$x-amz-checksum-algorithm", "SHA256"],
        ["eq", "$x-amz-checksum-sha256", checksum],
      ]),
    );
  });

  it("signs object() S3 headers into the fields", async () => {
    const { config } = setup({
      method: "POST",
      object: () => ({
        storageClass: "STANDARD_IA",
        cacheControl: "max-age=3600",
        tagging: { env: "prod" },
      }),
    });
    const presigned = await presignUpload(config, defaultUploadBody);

    if (presigned.method !== "POST") throw new Error("expected POST");
    expect(presigned.fields).toMatchObject({
      "x-amz-storage-class": "STANDARD_IA",
      "Cache-Control": "max-age=3600",
      "x-amz-tagging": "env=prod",
    });
  });
});

describe("presignUpload hooks", () => {
  it("runs onStart with the upload token, URL and absolute deadlines", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const onStart = vi.fn<(context: UploadOnStartContext) => void>();
    const { config } = setup({ onStart: [{ hook: onStart }] });

    const presigned = await presignUpload(config, {
      ...defaultUploadBody,
      metadata: { folder: "docs" },
    });

    if (presigned.method !== "PUT") throw new Error("expected PUT");
    expect(onStart).toHaveBeenCalledOnce();
    const context = onStart.mock.calls[0][0];
    expect(context).toMatchObject({
      operation: "upload",
      route: "uploads",
      kind: "put",
      key: presigned.key,
      bucket: TEST_BUCKET,
      file: { name: "a.png", size: 10, type: "image/png" },
      acl: "private",
      clientMetadata: { folder: "docs" },
      uploadToken: presigned.headers["x-amz-meta-dimah-upload"],
      url: presigned.url,
      urlExpiresAt: new Date(NOW.getTime() + 600_000),
      expiresAt: new Date(NOW.getTime() + (600 + 3600) * 1000),
    });
    expect(context.uploadId).toBeUndefined();
  });

  it("reports kind post for POST routes", async () => {
    const onStart = vi.fn();
    const { config } = setup({ method: "POST", onStart: [{ hook: onStart }] });
    await presignUpload(config, defaultUploadBody);
    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "post" }),
    );
  });

  it("runs guards in order, then onStart plugins before the user hook", async () => {
    const order: string[] = [];
    const log = (name: string) => () => void order.push(name);
    const { config } = setup(
      {
        guard: [
          { plugin: "db", hook: log("upload guard: db") },
          { hook: log("upload guard: user") },
        ],
        onStart: [
          { plugin: "db", hook: log("onStart: db") },
          { hook: log("onStart: user") },
        ],
      },
      { guard: [{ hook: log("instance guard") }] },
    );
    config.routes.uploads.guard = [{ hook: log("route guard") }];

    await presignUpload(config, defaultUploadBody);
    expect(order).toEqual([
      "instance guard",
      "route guard",
      "upload guard: db",
      "upload guard: user",
      "onStart: db",
      "onStart: user",
    ]);
  });

  it("passes guard locals to onStart", async () => {
    const onStart = vi.fn();
    const { config } = setup({
      guard: [{ hook: () => ({ locals: { userId: "u1" } }) }],
      onStart: [{ hook: onStart }],
    });
    await presignUpload(config, defaultUploadBody);
    expect({ ...onStart.mock.calls[0][0].locals }).toEqual({ userId: "u1" });
  });

  it("does not presign or run onStart when upload.guard rejects", async () => {
    const onStart = vi.fn();
    const { s3, config } = setup({
      guard: [
        {
          hook: () => {
            throw s3Error("FORBIDDEN");
          },
        },
      ],
      onStart: [{ hook: onStart }],
    });
    await expect(
      presignUpload(config, defaultUploadBody),
    ).rejects.toMatchObject({ code: "FORBIDDEN", statusCode: 403 });
    expect(onStart).not.toHaveBeenCalled();
    expect(s3.send).not.toHaveBeenCalled();
  });

  it("returns the onStart error, and no object exists", async () => {
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
    await expect(
      presignUpload(config, defaultUploadBody),
    ).rejects.toMatchObject({ code: "QUOTA_EXCEEDED", statusCode: 403 });
    expect(s3.objects.size).toBe(0);
  });

  it("turns a plain Error from onStart into a logged 500", async () => {
    const error = vi.fn();
    const failure = new Error("db down");
    const { config } = setup(
      {
        onStart: [
          {
            hook: () => {
              throw failure;
            },
          },
        ],
      },
      { logger: { error } },
    );
    await expect(
      presignUpload(config, defaultUploadBody),
    ).rejects.toMatchObject({ code: "INTERNAL_ERROR", statusCode: 500 });
    expect(error).toHaveBeenCalledWith("db down", failure);
  });
});

describe("presignUpload checks", () => {
  it("requires a checksum when the route sets upload.checksum", async () => {
    const { config } = setup({ checksum: true });
    await expect(
      presignUpload(config, defaultUploadBody),
    ).rejects.toMatchObject({ code: "CHECKSUM_REQUIRED", statusCode: 400 });
    await expect(
      presignUpload(config, {
        ...defaultUploadBody,
        checksum: await sha256Base64(body),
      }),
    ).resolves.toMatchObject({ method: "PUT" });
  });

  it("requires a checksum when verifyContent is on", async () => {
    const s3 = memoryS3();
    const config = testConfig({
      routes: resolveRoutes(
        {
          client: s3.client,
          bucket: TEST_BUCKET,
          routes: { uploads: { upload: { verifyContent: true } } },
        },
        { maxExpiresIn: 604_800 },
      ),
    });
    await expect(
      presignUpload(config, defaultUploadBody),
    ).rejects.toMatchObject({ code: "CHECKSUM_REQUIRED" });
  });

  it("rejects a file type outside fileTypes", async () => {
    const { config } = setup({ fileTypes: ["image/*"] });
    await expect(
      presignUpload(config, {
        ...defaultUploadBody,
        name: "a.exe",
        type: "application/octet-stream",
      }),
    ).rejects.toMatchObject({
      code: "FILE_TYPE_NOT_ALLOWED",
      params: { type: ".exe", allowed: "image/*" },
    });
  });

  it("rejects a declared size of 0 with FILE_EMPTY", async () => {
    const { s3, config } = setup();
    await expect(
      presignUpload(config, { ...defaultUploadBody, size: 0 }),
    ).rejects.toMatchObject({ code: "FILE_EMPTY", statusCode: 400 });
    expect(s3.send).not.toHaveBeenCalled();
  });

  it("rejects a declared size over maxFileSize", async () => {
    const { config } = setup({ maxFileSize: 5 });
    await expect(
      presignUpload(config, defaultUploadBody),
    ).rejects.toMatchObject({
      code: "FILE_TOO_LARGE",
      statusCode: 413,
      params: { size: 10, maxFileSize: 5 },
    });
  });

  it.each(["POST", "PUT"] as const)(
    "rejects a %s upload over the 5 GiB single-request limit",
    async (method) => {
      const { s3, config } = setup({ method });
      const size = S3_MAX_POST_OBJECT_BYTES + 1;
      await expect(
        presignUpload(config, { ...defaultUploadBody, size }),
      ).rejects.toMatchObject({
        code: "FILE_TOO_LARGE",
        params: { size, maxFileSize: S3_MAX_POST_OBJECT_BYTES },
      });
      expect(s3.send).not.toHaveBeenCalled();
    },
  );

  it("rejects an unknown route and a route without upload", async () => {
    const { config } = setup();
    await expect(
      presignUpload(config, { ...defaultUploadBody, route: "nope" }),
    ).rejects.toMatchObject({ code: "UNKNOWN_ROUTE" });

    config.routes.uploads.upload = {
      enabled: false,
      multipart: { enabled: false },
    };
    await expect(
      presignUpload(config, defaultUploadBody),
    ).rejects.toMatchObject({
      code: "FEATURE_DISABLED",
      params: { feature: "upload" },
    });
  });
});

describe("presignUpload object identity and metadata", () => {
  it("nests the generated key under object().keyFolder", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "11111111-1111-1111-1111-111111111111",
    );
    const { config } = setup({ object: () => ({ keyFolder: "media" }) });
    await expect(
      presignUpload(config, defaultUploadBody),
    ).resolves.toMatchObject({
      key: "uploads/media/11111111-1111-1111-1111-111111111111/a.png",
    });
  });

  it("uses the route bucket", async () => {
    const { config } = setup();
    config.routes.uploads.bucket = "cdn-bucket";
    await expect(
      presignUpload(config, defaultUploadBody),
    ).resolves.toMatchObject({ bucket: "cdn-bucket" });
  });

  it("does not write client metadata unless object() copies it", async () => {
    const { config } = setup({
      object: ({ clientMetadata }) => ({
        metadata: { author: clientMetadata?.author ?? "anon" },
      }),
    });
    const presigned = await presignUpload(config, {
      ...defaultUploadBody,
      metadata: { author: "user_123", source: "web" },
    });

    if (presigned.method !== "PUT") throw new Error("expected PUT");
    expect(presigned.headers["x-amz-meta-author"]).toBe("user_123");
    expect(presigned.headers).not.toHaveProperty("x-amz-meta-source");
  });

  it("round-trips non-ASCII object() metadata through RFC 2047", async () => {
    const onConfirmed = vi.fn();
    const { s3, config } = setup({
      object: () => ({ metadata: { author: "Zoë Ångström" } }),
      onConfirmed: [{ hook: onConfirmed }],
    });
    const presigned = await presignUpload(config, defaultUploadBody);

    if (presigned.method !== "PUT") throw new Error("expected PUT");
    expect(presigned.headers["x-amz-meta-author"]).toMatch(
      /^=\?UTF-8\?B\?.+\?=$/,
    );
    await sendUpload(s3, presigned);

    const confirmed = await confirmUpload(config, { ticket: presigned.ticket });
    expect(confirmed.metadata).toEqual({ author: "Zoë Ångström" });
    expect(onConfirmed).toHaveBeenCalledWith(
      expect.objectContaining({
        object: expect.objectContaining({
          metadata: { author: "Zoë Ångström" },
        }),
      }),
    );
  });

  it("fails with a logged 500 when metadata exceeds 2048 bytes", async () => {
    const error = vi.fn();
    const { s3, config } = setup(
      { object: () => ({ metadata: { notes: "x".repeat(2048) } }) },
      { logger: { error } },
    );

    const result = await presignUpload(config, defaultUploadBody).catch(
      (thrown: unknown) => thrown,
    );
    expect(isAPIError(result)).toBe(true);
    expect(result).toMatchObject({ code: "INTERNAL_ERROR", statusCode: 500 });
    expect(error).toHaveBeenCalledWith(
      expect.stringMatching(/^Config error: S3 metadata is \d+ bytes/),
      expect.any(ConfigError),
    );
    expect(s3.send).not.toHaveBeenCalled();
  });
});
