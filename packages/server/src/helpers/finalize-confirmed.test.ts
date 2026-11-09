import {
  DeleteObjectCommand,
  GetObjectCommand,
  type HeadObjectCommandOutput,
} from "@aws-sdk/client-s3";
import { isAPIError, s3Error, SNIFF_BYTE_LENGTH } from "@dimah-s3/core";
import { describe, expect, it, vi } from "vitest";
import {
  memoryS3,
  TEST_BUCKET,
  testRoute,
  testUpload,
  type MemoryObject,
  type MemoryS3,
} from "@/test/harness";
import type {
  ObjectContext,
  UploadConfirmGuardContext,
  UploadFile,
  UploadKind,
  UploadOnConfirmedContext,
} from "@/types";
import type { Guard } from "@/types/locals";
import type { OpenedRoute, ResolvedUpload } from "@/types/resolved";
import { ConfigError } from "./error-boundary";
import {
  finalizeConfirmed,
  type FinalizeConfirmedInput,
} from "./finalize-confirmed";
import { createLocals } from "./hooks";
import { buildObjectMetadata } from "./object-meta";

const TOKEN = "upload-token";
const KEY = "uploads/a.png";
const BYTES = new TextEncoder().encode("0123456789");
const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48,
  0x44, 0x52,
]);

function awsError(name: string, httpStatusCode: number) {
  return Object.assign(new Error(name), {
    name,
    $metadata: { httpStatusCode },
  });
}

function commands(s3: MemoryS3) {
  return s3.send.mock.calls.map(([command]) => command);
}

function deleteInputs(s3: MemoryS3) {
  return commands(s3).flatMap((command) =>
    command instanceof DeleteObjectCommand ? [command.input] : [],
  );
}

function getInputs(s3: MemoryS3) {
  return commands(s3).flatMap((command) =>
    command instanceof GetObjectCommand ? [command.input] : [],
  );
}

type SetupOptions = {
  upload?: Partial<ResolvedUpload>;
  keyPrefix?: string | false;
  kind?: UploadKind;
  operation?: ObjectContext["operation"];
  uploadToken?: string;
  uploadId?: string;
  file?: Partial<UploadFile>;
  acl?: FinalizeConfirmedInput["acl"];
  key?: string;
  body?: Uint8Array | string;
  /** When false, nothing is stored. HeadObject fields stay synthetic. */
  seed?: boolean;
  userMetadata?: Record<string, string>;
  previousKey?: string;
  /**
   * Marker written on the head. Defaults to the upload token.
   * `null` omits it.
   */
  marker?: string | null;
  /** Replaces the built metadata, so a mixed-case marker key can be sent. */
  rawMetadata?: Record<string, string>;
  /** `null` omits Content-Type. */
  contentType?: string | null;
  /** `null` omits Content-Disposition, so the name comes from the key. */
  contentDisposition?: string | null;
  contentLength?: number;
  omitContentLength?: boolean;
  /** `null` omits the ETag. Defaults to the stored object's ETag. */
  eTag?: string | null;
  versionId?: string;
  lastModified?: Date;
};

function openedRoute(
  client: MemoryS3["client"],
  upload: Partial<ResolvedUpload>,
  keyPrefix: string | false | undefined,
): OpenedRoute<"upload"> {
  const route = testRoute({
    client,
    upload: testUpload(upload),
    ...(keyPrefix !== undefined ? { keyPrefix } : {}),
  });
  if (!route.upload.enabled) {
    throw new Error("Test route has upload disabled.");
  }
  return { ...route, upload: route.upload };
}

function byteLength(body: Uint8Array | string): number {
  return typeof body === "string"
    ? new TextEncoder().encode(body).length
    : body.length;
}

function headMetadata(
  options: SetupOptions,
  uploadToken: string,
): Record<string, string> | undefined {
  if (options.rawMetadata) return options.rawMetadata;
  const marker = options.marker === undefined ? uploadToken : options.marker;
  if (
    marker === null &&
    options.userMetadata === undefined &&
    options.previousKey === undefined
  ) {
    return undefined;
  }
  const built = buildObjectMetadata({
    metadata: options.userMetadata,
    uploadToken: marker ?? "unused-marker",
    previousKey: options.previousKey,
  });
  if (marker !== null) return built;
  const { "dimah-upload": _marker, ...rest } = built;
  return rest;
}

function setup(options: SetupOptions = {}) {
  const s3 = memoryS3();
  const key = options.key ?? KEY;
  const uploadToken = options.uploadToken ?? TOKEN;
  const body = options.body ?? BYTES;
  const bytes = byteLength(body);
  const contentType =
    options.contentType === null
      ? undefined
      : (options.contentType ?? "image/png");
  const contentDisposition =
    options.contentDisposition === null
      ? undefined
      : (options.contentDisposition ?? 'attachment; filename="a.png"');
  const metadata = headMetadata(options, uploadToken);
  const stored =
    options.seed === false
      ? undefined
      : s3.seed(key, body, {
          contentType,
          contentDisposition,
          metadata,
        });
  const contentLength = options.omitContentLength
    ? undefined
    : (options.contentLength ?? bytes);
  const eTag =
    options.eTag === null
      ? undefined
      : (options.eTag ?? stored?.eTag ?? '"abc"');
  const head = {
    $metadata: { httpStatusCode: 200 },
    ...(contentType !== undefined ? { ContentType: contentType } : {}),
    ...(contentDisposition !== undefined
      ? { ContentDisposition: contentDisposition }
      : {}),
    ...(metadata !== undefined ? { Metadata: metadata } : {}),
    ...(contentLength !== undefined ? { ContentLength: contentLength } : {}),
    ...(eTag !== undefined ? { ETag: eTag } : {}),
    ...(options.versionId !== undefined
      ? { VersionId: options.versionId }
      : {}),
    ...(options.lastModified !== undefined
      ? { LastModified: options.lastModified }
      : {}),
  } as HeadObjectCommandOutput;
  const file: UploadFile = {
    name: "a.png",
    size: contentLength ?? bytes,
    type: "image/png",
    ...options.file,
  };
  const context: ObjectContext = {
    request: new Request("http://localhost/api/s3/confirm"),
    operation: options.operation ?? "confirm",
    locals: createLocals(),
    route: "uploads",
    key,
    bucket: TEST_BUCKET,
  };
  const route = openedRoute(s3.client, options.upload ?? {}, options.keyPrefix);
  const input: FinalizeConfirmedInput = {
    route,
    context,
    kind: options.kind ?? "put",
    uploadToken,
    uploadId: options.uploadId,
    file,
    acl: options.acl ?? "private",
    head,
  };
  return { s3, route, input, key, eTag, stored, uploadToken };
}

function requireStored(stored: MemoryObject | undefined): MemoryObject {
  if (!stored) throw new Error("Expected the uploaded object to be stored.");
  return stored;
}

function conditionalDelete(key: string, eTag: string | undefined) {
  return [{ Bucket: TEST_BUCKET, Key: key, IfMatch: eTag }];
}

describe("finalizeConfirmed", () => {
  it("returns the object as HeadObject reports it, without internal metadata", async () => {
    const lastModified = new Date("2026-03-04T05:06:07.000Z");
    const { input, stored, s3 } = setup({
      acl: "public-read",
      userMetadata: { author: "José" },
      versionId: "ver-1",
      lastModified,
    });
    const object = requireStored(stored);

    await expect(finalizeConfirmed(input)).resolves.toEqual({
      key: KEY,
      bucket: TEST_BUCKET,
      name: "a.png",
      size: BYTES.length,
      type: "image/png",
      eTag: object.eTag.replaceAll('"', ""),
      versionId: "ver-1",
      lastModified: lastModified.toISOString(),
      metadata: { author: "José" },
      acl: "public-read",
    });
    // The body is not a PNG. verifyContent is off, so nothing is read or deleted.
    expect(s3.send).not.toHaveBeenCalled();
    expect(s3.get(KEY)).toBeDefined();
  });

  it("gives onConfirmed the declared file and the verified object", async () => {
    const onConfirmed = vi.fn<(context: UploadOnConfirmedContext) => void>();
    const lastModified = new Date("2026-03-04T05:06:07.000Z");
    const { input, stored } = setup({
      acl: "public-read",
      uploadId: "mp-1",
      kind: "multipart",
      userMetadata: { source: "web" },
      contentDisposition: 'attachment; filename="renamed.png"',
      versionId: "ver-1",
      lastModified,
      upload: { onConfirmed: [{ hook: onConfirmed }] },
    });

    await finalizeConfirmed(input);
    expect(onConfirmed).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        operation: "confirm",
        route: "uploads",
        key: KEY,
        bucket: TEST_BUCKET,
        kind: "multipart",
        uploadToken: TOKEN,
        uploadId: "mp-1",
        acl: "public-read",
        file: { name: "a.png", size: BYTES.length, type: "image/png" },
        object: {
          name: "renamed.png",
          size: BYTES.length,
          type: "image/png",
          eTag: requireStored(stored).eTag.replaceAll('"', ""),
          versionId: "ver-1",
          lastModified: lastModified.toISOString(),
          metadata: { source: "web" },
        },
      }),
    );
  });

  it("runs plugin onConfirmed hooks before user hooks, in list order within each group", async () => {
    const order: string[] = [];
    const { input } = setup({
      upload: {
        onConfirmed: [
          { hook: () => void order.push("user-first") },
          { plugin: "db", hook: () => void order.push("db") },
          { plugin: "audit", hook: () => void order.push("audit") },
          { hook: () => void order.push("user-second") },
        ],
      },
    });

    await finalizeConfirmed(input);
    expect(order).toEqual(["db", "audit", "user-first", "user-second"]);
  });

  it("passes confirmGuard locals through to onConfirmed", async () => {
    const onConfirmed = vi.fn<(context: UploadOnConfirmedContext) => void>();
    const { input } = setup({
      upload: {
        confirmGuard: [
          { plugin: "auth", hook: () => ({ locals: { userId: "u1" } }) },
          {
            hook: ({ locals }) => {
              locals.role = "admin";
            },
          },
        ],
        onConfirmed: [{ hook: onConfirmed }],
      },
    });

    await finalizeConfirmed(input);
    expect(onConfirmed).toHaveBeenCalledWith(
      expect.objectContaining({
        locals: expect.objectContaining({ userId: "u1", role: "admin" }),
      }),
    );
  });

  it("reads a mixed-case marker key", async () => {
    const { input } = setup({
      rawMetadata: { "Dimah-Upload": TOKEN, Source: "web" },
    });

    await expect(finalizeConfirmed(input)).resolves.toMatchObject({
      metadata: { source: "web" },
    });
  });

  it("uses the key leaf when the object has no content disposition", async () => {
    const key = "uploads/uuid/photo.png";
    const { input } = setup({ key, contentDisposition: null });

    await expect(finalizeConfirmed(input)).resolves.toMatchObject({
      key,
      name: "photo.png",
    });
  });

  it("reads the first bytes when verifyContent is on and they match", async () => {
    const { s3, input } = setup({
      body: PNG,
      upload: { verifyContent: true },
    });

    await expect(finalizeConfirmed(input)).resolves.toMatchObject({
      key: KEY,
      size: PNG.length,
      type: "image/png",
    });
    expect(getInputs(s3)).toEqual([
      {
        Bucket: TEST_BUCKET,
        Key: KEY,
        Range: `bytes=0-${SNIFF_BYTE_LENGTH - 1}`,
      },
    ]);
    expect(deleteInputs(s3)).toEqual([]);
  });

  it("does not read a type that has no magic bytes", async () => {
    const { s3, input } = setup({
      upload: { verifyContent: true },
      contentType: "text/plain",
    });

    await expect(finalizeConfirmed(input)).resolves.toMatchObject({
      type: "text/plain",
    });
    expect(s3.send).not.toHaveBeenCalled();
  });

  it("checks an untyped object against the type its name gives", async () => {
    const { s3, input } = setup({
      body: PNG,
      upload: { verifyContent: true },
      contentType: "application/octet-stream",
      contentDisposition: 'attachment; filename="x.png"',
    });

    await expect(finalizeConfirmed(input)).resolves.toMatchObject({
      name: "x.png",
      type: "application/octet-stream",
    });
    expect(getInputs(s3)).toHaveLength(1);
  });

  it("skips confirmGuard for s3.put and still runs onConfirmed", async () => {
    const confirmGuard = vi.fn(() => {
      throw s3Error("FORBIDDEN");
    });
    const onConfirmed = vi.fn<(context: UploadOnConfirmedContext) => void>();
    const { input } = setup({
      kind: "server",
      operation: "put",
      upload: {
        confirmGuard: [{ hook: confirmGuard }],
        onConfirmed: [{ hook: onConfirmed }],
      },
    });

    await expect(finalizeConfirmed(input)).resolves.toMatchObject({ key: KEY });
    expect(confirmGuard).not.toHaveBeenCalled();
    expect(onConfirmed).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "server", operation: "put" }),
    );
  });

  describe("marker", () => {
    it.each([
      ["a different upload token", "other-token"],
      ["no marker", null],
    ] as const)(
      "rejects %s with OBJECT_NOT_FOUND and deletes nothing",
      async (_label, marker) => {
        const confirmGuard = vi.fn();
        const onConfirmed = vi.fn();
        const { s3, input } = setup({
          marker,
          file: { size: 1 },
          upload: {
            confirmGuard: [{ hook: confirmGuard }],
            onConfirmed: [{ hook: onConfirmed }],
          },
        });

        await expect(finalizeConfirmed(input)).rejects.toMatchObject({
          code: "OBJECT_NOT_FOUND",
          statusCode: 404,
        });
        expect(s3.get(KEY)).toBeDefined();
        expect(s3.send).not.toHaveBeenCalled();
        expect(confirmGuard).not.toHaveBeenCalled();
        expect(onConfirmed).not.toHaveBeenCalled();
      },
    );
  });

  describe("verification", () => {
    it("deletes on UPLOAD_SIZE_MISMATCH, conditional on the HeadObject ETag", async () => {
      const confirmGuard = vi.fn();
      const { s3, input, eTag } = setup({
        file: { size: 4 },
        upload: { confirmGuard: [{ hook: confirmGuard }] },
      });

      await expect(finalizeConfirmed(input)).rejects.toMatchObject({
        code: "UPLOAD_SIZE_MISMATCH",
        statusCode: 400,
        params: { expected: 4, actual: BYTES.length },
      });
      expect(eTag?.startsWith('"')).toBe(true);
      expect(deleteInputs(s3)).toEqual(conditionalDelete(KEY, eTag));
      expect(s3.get(KEY)).toBeUndefined();
      expect(confirmGuard).not.toHaveBeenCalled();
    });

    it("reports a size mismatch before a type failure", async () => {
      const { input } = setup({
        file: { size: 4 },
        upload: { fileTypes: ["text/*"] },
      });

      await expect(finalizeConfirmed(input)).rejects.toMatchObject({
        code: "UPLOAD_SIZE_MISMATCH",
      });
    });

    it("checks the stored name and type, not the declared file", async () => {
      const { s3, input, eTag } = setup({
        upload: { fileTypes: ["image/*"] },
        contentType: "text/html",
        contentDisposition: 'attachment; filename="a.html"',
        file: { name: "a.png", type: "image/png" },
      });

      await expect(finalizeConfirmed(input)).rejects.toMatchObject({
        code: "FILE_TYPE_NOT_ALLOWED",
        statusCode: 400,
        params: { type: ".html" },
      });
      expect(deleteInputs(s3)).toEqual(conditionalDelete(KEY, eTag));
      expect(s3.get(KEY)).toBeUndefined();
    });

    it("deletes an empty object", async () => {
      const { s3, input, eTag } = setup({ body: "", contentLength: 0 });

      await expect(finalizeConfirmed(input)).rejects.toMatchObject({
        code: "FILE_EMPTY",
        statusCode: 400,
      });
      expect(deleteInputs(s3)).toEqual(conditionalDelete(KEY, eTag));
    });

    it("deletes an object over maxFileSize", async () => {
      const { s3, input, eTag } = setup({
        upload: { maxFileSize: 4 },
      });

      await expect(finalizeConfirmed(input)).rejects.toMatchObject({
        code: "FILE_TOO_LARGE",
        statusCode: 413,
        params: { size: BYTES.length, maxFileSize: 4 },
      });
      expect(deleteInputs(s3)).toEqual(conditionalDelete(KEY, eTag));
    });

    it("keeps the object when HeadObject has no ContentLength", async () => {
      const { s3, input } = setup({ omitContentLength: true });

      const run = () => finalizeConfirmed(input);
      await expect(run()).rejects.toThrow(TypeError);
      await expect(run()).rejects.toThrow(
        `HeadObject returned no ContentLength for "${KEY}".`,
      );
      expect(s3.get(KEY)).toBeDefined();
      expect(s3.send).not.toHaveBeenCalled();
    });

    it("deletes content that does not match the type before any hook runs", async () => {
      const confirmGuard = vi.fn();
      const onConfirmed = vi.fn();
      const { s3, input, eTag } = setup({
        upload: {
          verifyContent: true,
          confirmGuard: [{ hook: confirmGuard }],
          onConfirmed: [{ hook: onConfirmed }],
        },
      });

      await expect(finalizeConfirmed(input)).rejects.toMatchObject({
        code: "FILE_CONTENT_MISMATCH",
        statusCode: 400,
        params: { type: "image/png", detected: "unknown" },
      });
      expect(deleteInputs(s3)).toEqual(conditionalDelete(KEY, eTag));
      expect(s3.get(KEY)).toBeUndefined();
      expect(confirmGuard).not.toHaveBeenCalled();
      expect(onConfirmed).not.toHaveBeenCalled();
    });

    it("deletes an untyped object whose bytes do not match its name", async () => {
      const { s3, input } = setup({
        upload: { verifyContent: true },
        contentType: "application/octet-stream",
        contentDisposition: 'attachment; filename="x.png"',
      });

      await expect(finalizeConfirmed(input)).rejects.toMatchObject({
        code: "FILE_CONTENT_MISMATCH",
        params: { type: "image/png", detected: "unknown" },
      });
      expect(s3.get(KEY)).toBeUndefined();
    });

    it("deletes when the content read finds the object gone", async () => {
      const { s3, input, eTag } = setup({
        body: PNG,
        upload: { verifyContent: true },
      });
      s3.send.mockRejectedValueOnce(awsError("NotFound", 404));

      await expect(finalizeConfirmed(input)).rejects.toMatchObject({
        code: "OBJECT_NOT_FOUND",
        statusCode: 404,
      });
      expect(deleteInputs(s3)).toEqual(conditionalDelete(KEY, eTag));
      expect(s3.get(KEY)).toBeUndefined();
    });

    it("keeps the object when the content read fails on the network", async () => {
      const failure = Object.assign(new Error("socket hang up"), {
        code: "ECONNRESET",
      });
      const { s3, input } = setup({
        body: PNG,
        upload: { verifyContent: true },
      });
      s3.send.mockRejectedValueOnce(failure);

      await expect(finalizeConfirmed(input)).rejects.toBe(failure);
      expect(s3.get(KEY)).toBeDefined();
      expect(deleteInputs(s3)).toEqual([]);
    });

    it("still returns the rejection when the compensating delete fails", async () => {
      const { s3, input } = setup({ file: { size: 1 } });
      const send = s3.send.getMockImplementation();
      s3.send.mockImplementation(async (command) => {
        if (command instanceof DeleteObjectCommand) {
          throw awsError("InternalError", 500);
        }
        return send?.(command);
      });

      await expect(finalizeConfirmed(input)).rejects.toMatchObject({
        code: "UPLOAD_SIZE_MISMATCH",
        statusCode: 400,
      });
      expect(s3.get(KEY)).toBeDefined();
    });

    it("deletes a size mismatch for s3.put without running confirmGuard", async () => {
      const confirmGuard = vi.fn(() => {
        throw s3Error("FORBIDDEN");
      });
      const { s3, input, eTag } = setup({
        kind: "server",
        file: { size: 99 },
        upload: { confirmGuard: [{ hook: confirmGuard }] },
      });

      await expect(finalizeConfirmed(input)).rejects.toMatchObject({
        code: "UPLOAD_SIZE_MISMATCH",
        params: { expected: 99, actual: BYTES.length },
      });
      expect(confirmGuard).not.toHaveBeenCalled();
      expect(deleteInputs(s3)).toEqual(conditionalDelete(KEY, eTag));
    });
  });

  describe("confirmGuard", () => {
    it.each([
      ["put", undefined],
      ["post", undefined],
      ["multipart", "mp-1"],
    ] as const)(
      "runs for a %s upload with the verified object",
      async (kind, uploadId) => {
        const confirmGuard =
          vi.fn<(context: UploadConfirmGuardContext) => void>();
        const { input, stored } = setup({
          kind,
          uploadId,
          upload: { confirmGuard: [{ hook: confirmGuard }] },
        });

        await finalizeConfirmed(input);
        expect(confirmGuard).toHaveBeenCalledWith(
          expect.objectContaining({
            operation: "confirm",
            kind,
            key: KEY,
            bucket: TEST_BUCKET,
            uploadToken: TOKEN,
            uploadId,
            acl: "private",
            file: { name: "a.png", size: BYTES.length, type: "image/png" },
            object: expect.objectContaining({
              name: "a.png",
              size: BYTES.length,
              type: "image/png",
              eTag: requireStored(stored).eTag.replaceAll('"', ""),
              metadata: {},
            }),
          }),
        );
      },
    );

    it("deletes on a 4xx rejection and keeps previousKey", async () => {
      const failure = s3Error("FORBIDDEN");
      const onConfirmed = vi.fn();
      const previous = "uploads/old.png";
      const { s3, input, eTag } = setup({
        previousKey: previous,
        upload: {
          confirmGuard: [
            {
              hook: () => {
                throw failure;
              },
            },
          ],
          onConfirmed: [{ hook: onConfirmed }],
        },
      });
      s3.seed(previous, "old");

      await expect(finalizeConfirmed(input)).rejects.toBe(failure);
      expect(deleteInputs(s3)).toEqual(conditionalDelete(KEY, eTag));
      expect(s3.get(KEY)).toBeUndefined();
      expect(s3.get(previous)).toBeDefined();
      expect(onConfirmed).not.toHaveBeenCalled();
    });

    it("keeps a newer object when If-Match does not hold", async () => {
      const replacement = new TextEncoder().encode("9876543210");
      const { s3, input, eTag } = setup({
        upload: {
          confirmGuard: [
            {
              hook: () => {
                s3.seed(KEY, replacement, { contentType: "image/png" });
                throw s3Error("FORBIDDEN");
              },
            },
          ],
        },
      });

      await expect(finalizeConfirmed(input)).rejects.toMatchObject({
        code: "FORBIDDEN",
        statusCode: 403,
      });
      expect(deleteInputs(s3)).toEqual(conditionalDelete(KEY, eTag));
      expect(s3.get(KEY)?.body).toEqual(replacement);
    });

    it("keeps the object when the guard throws a plain Error", async () => {
      const failure = new Error("database down");
      const { s3, input } = setup({
        upload: {
          confirmGuard: [
            {
              hook: () => {
                throw failure;
              },
            },
          ],
        },
      });

      await expect(finalizeConfirmed(input)).rejects.toBe(failure);
      expect(s3.get(KEY)).toBeDefined();
      expect(deleteInputs(s3)).toEqual([]);
    });

    it("keeps the object when the guard throws a 5xx APIError", async () => {
      const failure = s3Error("INTERNAL_ERROR");
      const { s3, input } = setup({
        upload: {
          confirmGuard: [
            {
              hook: () => {
                throw failure;
              },
            },
          ],
        },
      });

      await expect(finalizeConfirmed(input)).rejects.toBe(failure);
      expect(failure.statusCode).toBe(500);
      expect(s3.get(KEY)).toBeDefined();
      expect(deleteInputs(s3)).toEqual([]);
    });

    it("keeps the object when the guard returns a value other than { locals }", async () => {
      const { s3, input } = setup({
        upload: {
          confirmGuard: [
            {
              hook: (() => true) as unknown as Guard<UploadConfirmGuardContext>,
            },
          ],
        },
      });

      await expect(finalizeConfirmed(input)).rejects.toThrow(ConfigError);
      expect(s3.get(KEY)).toBeDefined();
      expect(deleteInputs(s3)).toEqual([]);
    });
  });

  describe("onConfirmed", () => {
    it("deletes on a plugin 4xx and does not run the user hook", async () => {
      const failure = s3Error("QUOTA_EXCEEDED", { limit: "bytes" });
      const user = vi.fn();
      const previous = "uploads/old.png";
      const { s3, input, eTag } = setup({
        previousKey: previous,
        upload: {
          onConfirmed: [
            {
              plugin: "db",
              hook: () => {
                throw failure;
              },
            },
            { plugin: "audit", hook: vi.fn() },
            { hook: user },
          ],
        },
      });
      s3.seed(previous, "old");

      await expect(finalizeConfirmed(input)).rejects.toBe(failure);
      expect(deleteInputs(s3)).toEqual(conditionalDelete(KEY, eTag));
      expect(s3.get(KEY)).toBeUndefined();
      expect(s3.get(previous)).toBeDefined();
      expect(user).not.toHaveBeenCalled();
    });

    it("keeps a newer object when a plugin rejection loses If-Match", async () => {
      const replacement = new TextEncoder().encode("9876543210");
      const { s3, input, eTag } = setup({
        upload: {
          onConfirmed: [
            {
              plugin: "db",
              hook: () => {
                s3.seed(KEY, replacement, { contentType: "image/png" });
                throw s3Error("QUOTA_EXCEEDED", { limit: "files" });
              },
            },
          ],
        },
      });

      await expect(finalizeConfirmed(input)).rejects.toMatchObject({
        code: "QUOTA_EXCEEDED",
        statusCode: 403,
      });
      expect(deleteInputs(s3)).toEqual(conditionalDelete(KEY, eTag));
      expect(s3.get(KEY)?.body).toEqual(replacement);
    });

    it("keeps the object when a plugin hook throws a 5xx APIError", async () => {
      const failure = s3Error("INTERNAL_ERROR");
      const user = vi.fn();
      const { s3, input } = setup({
        upload: {
          onConfirmed: [
            {
              plugin: "db",
              hook: () => {
                throw failure;
              },
            },
            { hook: user },
          ],
        },
      });

      await expect(finalizeConfirmed(input)).rejects.toBe(failure);
      expect(s3.get(KEY)).toBeDefined();
      expect(deleteInputs(s3)).toEqual([]);
      expect(user).not.toHaveBeenCalled();
    });

    it("keeps the object when a plugin hook throws a plain Error", async () => {
      const failure = new Error("database down");
      const { s3, input } = setup({
        upload: {
          onConfirmed: [
            {
              plugin: "db",
              hook: () => {
                throw failure;
              },
            },
          ],
        },
      });

      await expect(finalizeConfirmed(input)).rejects.toBe(failure);
      expect(s3.get(KEY)).toBeDefined();
      expect(deleteInputs(s3)).toEqual([]);
    });

    it("wraps a user APIError, keeps the object, and replays the same token", async () => {
      const forbidden = s3Error("FORBIDDEN");
      const tokens: string[] = [];
      let fail = true;
      const previous = "uploads/old.png";
      const { s3, input } = setup({
        previousKey: previous,
        upload: {
          onConfirmed: [
            {
              hook: ({ uploadToken }) => {
                tokens.push(uploadToken);
                if (fail) throw forbidden;
              },
            },
            { hook: vi.fn() },
          ],
        },
      });
      s3.seed(previous, "old");

      let caught: unknown;
      try {
        await finalizeConfirmed(input);
      } catch (error) {
        caught = error;
      }
      expect(isAPIError(caught)).toBe(false);
      expect(caught).toMatchObject({
        message: `upload.onConfirmed failed: ${forbidden.message}`,
        cause: forbidden,
      });
      expect(s3.get(KEY)).toBeDefined();
      expect(s3.get(previous)).toBeDefined();
      expect(deleteInputs(s3)).toEqual([]);

      fail = false;
      await expect(finalizeConfirmed(input)).resolves.toMatchObject({
        key: KEY,
      });
      expect(tokens).toEqual([TOKEN, TOKEN]);
      expect(s3.get(previous)).toBeUndefined();
    });

    it("rethrows a plain user error and keeps previousKey", async () => {
      const failure = new Error("webhook failed");
      const later = vi.fn();
      const previous = "uploads/old.png";
      const { s3, input } = setup({
        previousKey: previous,
        upload: {
          onConfirmed: [
            {
              hook: () => {
                throw failure;
              },
            },
            { hook: later },
          ],
        },
      });
      s3.seed(previous, "old");

      await expect(finalizeConfirmed(input)).rejects.toBe(failure);
      expect(later).not.toHaveBeenCalled();
      expect(s3.get(KEY)).toBeDefined();
      expect(s3.get(previous)).toBeDefined();
      expect(deleteInputs(s3)).toEqual([]);
    });
  });

  describe("previousKey", () => {
    it("deletes it after every hook, without an ETag precondition", async () => {
      const previous = "uploads/old.png";
      const seen: Array<string | undefined> = [];
      const { s3, input } = setup({
        previousKey: previous,
        upload: {
          onConfirmed: [
            {
              plugin: "db",
              hook: ({ previousKey: storedKey }) => void seen.push(storedKey),
            },
            {
              hook: ({ previousKey: storedKey }) => {
                expect(s3.get(previous)).toBeDefined();
                seen.push(storedKey);
              },
            },
          ],
        },
      });
      s3.seed(previous, "old");

      await finalizeConfirmed(input);
      expect(seen).toEqual([previous, previous]);
      expect(deleteInputs(s3)).toEqual([
        { Bucket: TEST_BUCKET, Key: previous },
      ]);
      expect(s3.get(previous)).toBeUndefined();
      expect(s3.get(KEY)).toBeDefined();
    });

    it("decodes a non-ASCII previous key before deleting it", async () => {
      const previous = "uploads/café.png";
      const { s3, input } = setup({ previousKey: previous });
      s3.seed(previous, "old");

      await finalizeConfirmed(input);
      expect(deleteInputs(s3)).toEqual([
        { Bucket: TEST_BUCKET, Key: previous },
      ]);
      expect(s3.get(previous)).toBeUndefined();
    });

    it("still confirms when deleting previousKey fails", async () => {
      const previous = "uploads/old.png";
      const { s3, input } = setup({ previousKey: previous });
      s3.seed(previous, "old");
      const send = s3.send.getMockImplementation();
      s3.send.mockImplementation(async (command) => {
        if (command instanceof DeleteObjectCommand) {
          throw awsError("InternalError", 500);
        }
        return send?.(command);
      });

      await expect(finalizeConfirmed(input)).resolves.toMatchObject({
        key: KEY,
      });
      expect(s3.get(KEY)).toBeDefined();
      expect(s3.get(previous)).toBeDefined();
    });

    it.each([
      ["the uploaded key", KEY],
      ["the uploaded key with a trailing slash", `${KEY}/`],
      ["an empty value", ""],
    ])(
      "does not delete previousKey when it is %s",
      async (_label, previousKey) => {
        const onConfirmed =
          vi.fn<(context: UploadOnConfirmedContext) => void>();
        const { s3, input } = setup({
          previousKey,
          upload: { onConfirmed: [{ hook: onConfirmed }] },
        });

        await finalizeConfirmed(input);
        expect(onConfirmed).toHaveBeenCalledOnce();
        expect(onConfirmed.mock.calls[0][0].previousKey).toBeUndefined();
        expect(deleteInputs(s3)).toEqual([]);
        expect(s3.get(KEY)).toBeDefined();
      },
    );

    it("ignores a previous key outside the route namespace", async () => {
      const outside = "other/secret.txt";
      const onConfirmed = vi.fn<(context: UploadOnConfirmedContext) => void>();
      const { s3, input } = setup({
        previousKey: outside,
        upload: { onConfirmed: [{ hook: onConfirmed }] },
      });
      s3.seed(outside, "secret");

      await expect(finalizeConfirmed(input)).resolves.toMatchObject({
        key: KEY,
      });
      expect(onConfirmed).toHaveBeenCalledOnce();
      expect(onConfirmed.mock.calls[0][0].previousKey).toBeUndefined();
      expect(s3.get(outside)).toBeDefined();
      expect(deleteInputs(s3)).toEqual([]);
    });

    it("ignores a previous key that leaves the namespace with ..", async () => {
      const secret = "other/secret.txt";
      const { s3, input } = setup({
        previousKey: "uploads/../other/secret.txt",
      });
      s3.seed(secret, "secret");

      await expect(finalizeConfirmed(input)).resolves.toMatchObject({
        key: KEY,
      });
      expect(s3.get(secret)).toBeDefined();
      expect(deleteInputs(s3)).toEqual([]);
    });

    it("deletes any other safe key when the route has no key prefix", async () => {
      const previous = "other/old.png";
      const onConfirmed = vi.fn<(context: UploadOnConfirmedContext) => void>();
      const { s3, input } = setup({
        keyPrefix: false,
        previousKey: previous,
        upload: { onConfirmed: [{ hook: onConfirmed }] },
      });
      s3.seed(previous, "old");

      await finalizeConfirmed(input);
      expect(onConfirmed).toHaveBeenCalledWith(
        expect.objectContaining({ previousKey: previous }),
      );
      expect(deleteInputs(s3)).toEqual([
        { Bucket: TEST_BUCKET, Key: previous },
      ]);
      expect(s3.get(previous)).toBeUndefined();
    });
  });

  describe("compensating delete", () => {
    it("sends a plain delete when HeadObject has no ETag", async () => {
      const { s3, input } = setup({ file: { size: 1 }, eTag: null });

      await expect(finalizeConfirmed(input)).rejects.toMatchObject({
        code: "UPLOAD_SIZE_MISMATCH",
      });
      expect(deleteInputs(s3)).toEqual([{ Bucket: TEST_BUCKET, Key: KEY }]);
      expect(s3.get(KEY)).toBeUndefined();
    });

    it("falls back to a plain delete when If-Match is not implemented", async () => {
      const { s3, input, eTag } = setup({ file: { size: 1 } });
      const send = s3.send.getMockImplementation();
      s3.send.mockImplementation(async (command) => {
        if (
          command instanceof DeleteObjectCommand &&
          command.input.IfMatch !== undefined
        ) {
          throw awsError("NotImplemented", 501);
        }
        return send?.(command);
      });

      await expect(finalizeConfirmed(input)).rejects.toMatchObject({
        code: "UPLOAD_SIZE_MISMATCH",
      });
      expect(deleteInputs(s3)).toEqual([
        { Bucket: TEST_BUCKET, Key: KEY, IfMatch: eTag },
        { Bucket: TEST_BUCKET, Key: KEY },
      ]);
      expect(s3.get(KEY)).toBeUndefined();
    });
  });
});
