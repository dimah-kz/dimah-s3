import { createHash } from "node:crypto";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListPartsCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import {
  DEFAULT_INLINE_TYPES,
  S3_API_BASE_PATH,
  sha256Base64,
  type S3ErrorCode,
} from "@dimah-s3/core";
import { expect, vi, type Mock } from "vitest";
import { route } from "@/route";
import type { DimahS3Config, DimahS3RouteConfig } from "@/types";
import type {
  ResolvedConfig,
  ResolvedDelete,
  ResolvedDownload,
  ResolvedMultipart,
  ResolvedRoute,
  ResolvedUpload,
} from "@/types/resolved";

/** Ticket secret for tests (at least 32 characters). */
export const TEST_SECRET = "test-secret-0123456789abcdef-0123456789";

export const TEST_BUCKET = "bucket";

/** Minimal S3 client. Override `send` per test. */
export function mockS3(
  send: S3Client["send"] = (async () => ({})) as S3Client["send"],
): S3Client {
  return {
    send,
    config: { requestChecksumCalculation: async () => "WHEN_REQUIRED" },
  } as unknown as S3Client;
}

/** Typical HeadObject payload used by confirm / download / delete. */
export function headResult(overrides: Record<string, unknown> = {}) {
  return {
    ContentType: "image/png",
    ContentLength: 10,
    ETag: '"abc"',
    Metadata: { source: "web" },
    ContentDisposition: 'attachment; filename="a.png"',
    ...overrides,
  };
}

/**
 * Dispatch `s3.send(command)` by `command.constructor.name`.
 * Values may be a result object or a function of the command.
 */
export function sendByCommand(handlers: Record<string, unknown>) {
  return vi.fn(async (command: { constructor: { name: string } }) => {
    const result = handlers[command.constructor.name];
    if (typeof result === "function") return result(command);
    if (result !== undefined) return result;
    return {};
  });
}

export const defaultUploadBody = {
  route: "uploads",
  name: "a.png",
  size: 10,
  type: "image/png",
};

export const storedPngKey = "uploads/a.png";
export const storedBinKey = "uploads/a.bin";

export function allFeaturesRoute(overrides: DimahS3RouteConfig = {}) {
  const { upload, ...rest } = overrides;
  return route({
    download: true,
    delete: true,
    ...rest,
    upload:
      upload === false
        ? false
        : {
            multipart: true,
            ...(typeof upload === "object" ? upload : {}),
          },
  });
}

/**
 * `dimahS3()` options with a {@link mockS3} client, the test bucket and
 * secret, and an `uploads` route with every feature on. The harness does not
 * import `dimahS3` itself, so operation tests can load it on their own.
 */
export function testInstanceConfig(
  overrides: Partial<DimahS3Config> = {},
): DimahS3Config {
  return {
    client: mockS3(),
    bucket: TEST_BUCKET,
    secret: TEST_SECRET,
    routes: { uploads: allFeaturesRoute() },
    ...overrides,
  };
}

export function apiUrl(path: string, basePath = S3_API_BASE_PATH) {
  return `http://localhost${basePath}${path}`;
}

export function jsonRequest(
  url: string,
  init: {
    method?: string;
    body?: unknown;
    headers?: HeadersInit;
  } = {},
) {
  const { method = "POST", body, headers } = init;
  const hasBody = body !== undefined && method !== "GET" && method !== "HEAD";
  return new Request(url, {
    method,
    headers: {
      "content-type": "application/json",
      ...Object.fromEntries(new Headers(headers).entries()),
    },
    body: hasBody ? JSON.stringify(body) : undefined,
  });
}

export async function expectErrorCode(
  response: Response,
  status: number,
  error: { code: S3ErrorCode | string },
) {
  expect(response.status).toBe(status);
  await expect(response.json()).resolves.toMatchObject({ code: error.code });
}

// ---------------------------------------------------------------------------
// Resolved config builders, for operation tests that skip `dimahS3()`.
// They mirror the documented defaults.
// ---------------------------------------------------------------------------

export function testMultipart(
  overrides: Partial<ResolvedMultipart> = {},
): ResolvedMultipart {
  return {
    enabled: true,
    ticketExpiresIn: 86_400,
    guard: [],
    onAbort: [],
    ...overrides,
  };
}

export function testUpload(
  overrides: Partial<ResolvedUpload> = {},
): ResolvedUpload {
  return {
    enabled: true,
    acl: "private",
    method: "PUT",
    expiresIn: 600,
    confirmWindow: 3600,
    checksum: false,
    verifyContent: false,
    multipart: testMultipart(),
    guard: [],
    onStart: [],
    confirmGuard: [],
    onConfirmed: [],
    ...overrides,
  };
}

export function testDownload(
  overrides: Partial<ResolvedDownload> = {},
): ResolvedDownload {
  return {
    enabled: true,
    maxExpiresIn: 600,
    disposition: "attachment",
    inlineTypes: DEFAULT_INLINE_TYPES,
    mode: "presign",
    guard: [],
    onPresigned: [],
    ...overrides,
  };
}

export function testDelete(
  overrides: Partial<ResolvedDelete> = {},
): ResolvedDelete {
  return { enabled: true, guard: [], onDeleted: [], ...overrides };
}

/** Route `uploads` with every feature on and a {@link mockS3} client. */
export function testRoute(
  overrides: Partial<ResolvedRoute> = {},
): ResolvedRoute {
  const name = overrides.name ?? "uploads";
  return {
    name,
    client: mockS3(),
    bucket: TEST_BUCKET,
    keyPrefix: name,
    plugins: {},
    guard: [],
    upload: testUpload(),
    download: testDownload(),
    delete: testDelete(),
    ...overrides,
  };
}

export function testConfig(
  overrides: Partial<ResolvedConfig> = {},
): ResolvedConfig {
  return {
    basePath: S3_API_BASE_PATH,
    secret: [TEST_SECRET],
    maxExpiresIn: 604_800,
    maxRequestBodySize: 1_048_576,
    logger: {},
    guard: [],
    routes: { uploads: testRoute() },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// In-memory S3. A real `S3Client` (so presigners can sign with it) whose
// `send` stores objects in memory.
// ---------------------------------------------------------------------------

export type MemoryObject = {
  body: Uint8Array;
  /** Quoted, as S3 returns it. */
  eTag: string;
  lastModified: Date;
  contentType?: string;
  contentDisposition?: string;
  cacheControl?: string;
  storageClass?: string;
  tagging?: string;
  /** Lowercase keys, values exactly as sent (RFC 2047-encoded if they were). */
  metadata: Record<string, string>;
  /** Base64 SHA-256. Multipart objects get a composite `…-N` value. */
  checksum?: string;
};

type MemoryPart = {
  body: Uint8Array;
  eTag: string;
  checksum?: string;
  lastModified: Date;
};

export type MemoryMultipartUpload = {
  bucket: string;
  key: string;
  fields: Omit<MemoryObject, "body" | "eTag" | "lastModified" | "checksum">;
  checksumAlgorithm?: string;
  parts: Map<number, MemoryPart>;
};

export type SeedInit = {
  bucket?: string;
  contentType?: string;
  contentDisposition?: string;
  cacheControl?: string;
  metadata?: Record<string, string>;
  checksum?: string;
  lastModified?: Date;
};

export type MemoryS3 = {
  client: S3Client;
  /** `client.send`. Use `mockImplementationOnce` / `mockRejectedValueOnce` to inject failures. */
  send: Mock<
    (
      command: unknown,
      options?: { abortSignal?: AbortSignal },
    ) => Promise<unknown>
  >;
  /** Objects by `bucket/key`. */
  objects: Map<string, MemoryObject>;
  /** Multipart uploads by upload id. */
  uploads: Map<string, MemoryMultipartUpload>;
  /** Per-key `DeleteObjects` errors, as S3 reports them. */
  deleteErrors: Map<string, { Code: string; Message: string }>;
  get: (key: string, bucket?: string) => MemoryObject | undefined;
  /** Store an object directly, skipping S3's header rules. */
  seed: (key: string, body: BodyInput, init?: SeedInit) => MemoryObject;
  /**
   * What S3 does with a presigned PUT or POST: `headers` are the request
   * headers or the POST form fields (`Content-Type`, `x-amz-meta-*`,
   * `x-amz-checksum-sha256`, …). It enforces the same rules as `PutObject`.
   */
  receiveUpload: (input: {
    key: string;
    body: BodyInput;
    headers: Record<string, string>;
    bucket?: string;
  }) => Promise<MemoryObject>;
};

type BodyInput = string | Uint8Array | ArrayBuffer;

const MAX_METADATA_BYTES = 2048;
const PRINTABLE_ASCII = /^[\x20-\x7e]*$/;

export function memoryS3(): MemoryS3 {
  const objects = new Map<string, MemoryObject>();
  const uploads = new Map<string, MemoryMultipartUpload>();
  const deleteErrors = new Map<string, { Code: string; Message: string }>();
  let uploadCount = 0;

  const id = (bucket: string | undefined, key: string | undefined) =>
    `${bucket ?? TEST_BUCKET}/${key ?? ""}`;

  function requireObject(bucket?: string, key?: string, name = "NoSuchKey") {
    const object = objects.get(id(bucket, key));
    if (!object) throw s3Exception(name, 404);
    return object;
  }

  function requireUpload(uploadId?: string) {
    const upload = uploadId ? uploads.get(uploadId) : undefined;
    if (!upload) throw s3Exception("NoSuchUpload", 404);
    return upload;
  }

  async function putObject(input: PutObjectCommand["input"]) {
    const body = await readBody(input.Body);
    if (
      input.ContentLength !== undefined &&
      input.ContentLength !== body.length
    ) {
      throw s3Exception("IncompleteBody", 400);
    }
    const metadata = checkedMetadata(input.Metadata);
    await assertChecksum(body, input.ChecksumSHA256);
    const object: MemoryObject = {
      body,
      eTag: quotedMd5(body),
      lastModified: new Date(),
      contentType: input.ContentType,
      contentDisposition: input.ContentDisposition,
      cacheControl: input.CacheControl,
      storageClass: input.StorageClass,
      tagging: input.Tagging,
      metadata,
      checksum: input.ChecksumSHA256,
    };
    objects.set(id(input.Bucket, input.Key), object);
    return object;
  }

  async function getObject(input: GetObjectCommand["input"]) {
    const object = requireObject(input.Bucket, input.Key);
    assertPreconditions(object, input);
    const size = object.body.length;
    const range = input.Range ? parseRange(input.Range, size) : undefined;
    if (range === null) throw s3Exception("InvalidRange", 416);
    const body = range
      ? object.body.slice(range.start, range.end + 1)
      : object.body;
    return {
      ...headFields(object, false),
      Body: sdkBody(body),
      ContentLength: body.length,
      AcceptRanges: "bytes",
      ...(range
        ? { ContentRange: `bytes ${range.start}-${range.end}/${size}` }
        : {}),
      $metadata: { httpStatusCode: range ? 206 : 200 },
    };
  }

  function deleteObjects(input: DeleteObjectsCommand["input"]) {
    const Deleted: { Key: string }[] = [];
    const Errors: { Key: string; Code: string; Message: string }[] = [];
    for (const { Key = "" } of input.Delete?.Objects ?? []) {
      const error = deleteErrors.get(Key);
      if (error) {
        Errors.push({ Key, ...error });
        continue;
      }
      objects.delete(id(input.Bucket, Key));
      Deleted.push({ Key });
    }
    return { Deleted, Errors };
  }

  function createMultipartUpload(input: CreateMultipartUploadCommand["input"]) {
    const UploadId = `upload-${++uploadCount}`;
    uploads.set(UploadId, {
      bucket: input.Bucket ?? TEST_BUCKET,
      key: input.Key ?? "",
      fields: {
        contentType: input.ContentType,
        contentDisposition: input.ContentDisposition,
        cacheControl: input.CacheControl,
        storageClass: input.StorageClass,
        tagging: input.Tagging,
        metadata: checkedMetadata(input.Metadata),
      },
      checksumAlgorithm: input.ChecksumAlgorithm,
      parts: new Map(),
    });
    return { UploadId, Bucket: input.Bucket, Key: input.Key };
  }

  async function uploadPart(input: UploadPartCommand["input"]) {
    const upload = requireUpload(input.UploadId);
    const body = await readBody(input.Body);
    if (
      input.ContentLength !== undefined &&
      input.ContentLength !== body.length
    ) {
      throw s3Exception("IncompleteBody", 400);
    }
    await assertChecksum(body, input.ChecksumSHA256);
    const part: MemoryPart = {
      body,
      eTag: quotedMd5(body),
      checksum: input.ChecksumSHA256,
      lastModified: new Date(),
    };
    upload.parts.set(input.PartNumber ?? 0, part);
    return { ETag: part.eTag, ChecksumSHA256: part.checksum };
  }

  function listParts(input: ListPartsCommand["input"]) {
    const upload = requireUpload(input.UploadId);
    const marker = Number(input.PartNumberMarker ?? 0);
    const maxParts = input.MaxParts ?? 1000;
    const sorted = [...upload.parts.entries()]
      .filter(([number]) => number > marker)
      .sort(([a], [b]) => a - b);
    const page = sorted.slice(0, maxParts);
    const truncated = sorted.length > maxParts;
    return {
      Parts: page.map(([number, part]) => ({
        PartNumber: number,
        Size: part.body.length,
        ETag: part.eTag,
        ChecksumSHA256: part.checksum,
        LastModified: part.lastModified,
      })),
      IsTruncated: truncated,
      ...(truncated ? { NextPartNumberMarker: String(page.at(-1)?.[0]) } : {}),
    };
  }

  async function completeMultipartUpload(
    input: CompleteMultipartUploadCommand["input"],
  ) {
    const upload = requireUpload(input.UploadId);
    const refs = input.MultipartUpload?.Parts ?? [];
    const parts = refs.map((ref) => {
      const part = upload.parts.get(ref.PartNumber ?? 0);
      if (!part || (ref.ETag !== undefined && ref.ETag !== part.eTag)) {
        throw s3Exception("InvalidPart", 400);
      }
      return part;
    });
    const body = concat(parts.map((part) => part.body));
    const digests = concat(parts.map((part) => md5(part.body)));
    const object: MemoryObject = {
      ...upload.fields,
      body,
      eTag: `"${createHash("md5").update(digests).digest("hex")}-${parts.length}"`,
      lastModified: new Date(),
      ...(upload.checksumAlgorithm
        ? { checksum: await compositeChecksum(parts) }
        : {}),
    };
    objects.set(id(upload.bucket, upload.key), object);
    uploads.delete(input.UploadId ?? "");
    return { Bucket: upload.bucket, Key: upload.key, ETag: object.eTag };
  }

  async function handle(command: unknown): Promise<unknown> {
    if (command instanceof PutObjectCommand) {
      const object = await putObject(command.input);
      return { ETag: object.eTag, ChecksumSHA256: object.checksum };
    }
    if (command instanceof HeadObjectCommand) {
      const object = requireObject(
        command.input.Bucket,
        command.input.Key,
        "NotFound",
      );
      return {
        ...headFields(object, command.input.ChecksumMode === "ENABLED"),
        ContentLength: object.body.length,
      };
    }
    if (command instanceof GetObjectCommand) {
      return getObject(command.input);
    }
    if (command instanceof DeleteObjectCommand) {
      objects.delete(id(command.input.Bucket, command.input.Key));
      return {};
    }
    if (command instanceof DeleteObjectsCommand) {
      return deleteObjects(command.input);
    }
    if (command instanceof CreateMultipartUploadCommand) {
      return createMultipartUpload(command.input);
    }
    if (command instanceof UploadPartCommand) {
      return uploadPart(command.input);
    }
    if (command instanceof ListPartsCommand) {
      return listParts(command.input);
    }
    if (command instanceof CompleteMultipartUploadCommand) {
      return completeMultipartUpload(command.input);
    }
    if (command instanceof AbortMultipartUploadCommand) {
      requireUpload(command.input.UploadId);
      uploads.delete(command.input.UploadId ?? "");
      return {};
    }
    throw new Error(
      `memoryS3: unsupported command ${(command as object).constructor.name}`,
    );
  }

  const send = vi.fn(
    async (command: unknown, options?: { abortSignal?: AbortSignal }) => {
      options?.abortSignal?.throwIfAborted();
      return handle(command);
    },
  );

  const client = new S3Client({
    region: "us-east-1",
    endpoint: "https://s3.test",
    forcePathStyle: true,
    credentials: { accessKeyId: "test", secretAccessKey: "test" },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  client.send = send as unknown as S3Client["send"];

  return {
    client,
    send,
    objects,
    uploads,
    deleteErrors,
    get: (key, bucket) => objects.get(id(bucket, key)),
    seed: (key, body, init = {}) => {
      const bytes = toBytes(body);
      const object: MemoryObject = {
        body: bytes,
        eTag: quotedMd5(bytes),
        lastModified: init.lastModified ?? new Date(),
        contentType: init.contentType,
        contentDisposition: init.contentDisposition,
        cacheControl: init.cacheControl,
        metadata: lowercaseKeys(init.metadata ?? {}),
        checksum: init.checksum,
      };
      objects.set(id(init.bucket, key), object);
      return object;
    },
    receiveUpload: ({ key, body, headers, bucket }) => {
      const header = (name: string) =>
        Object.entries(headers).find(
          ([field]) => field.toLowerCase() === name,
        )?.[1];
      const metadata = Object.fromEntries(
        Object.entries(headers)
          .filter(([field]) => field.toLowerCase().startsWith("x-amz-meta-"))
          .map(([field, value]) => [field.slice("x-amz-meta-".length), value]),
      );
      return putObject({
        Bucket: bucket ?? TEST_BUCKET,
        Key: key,
        Body: toBytes(body),
        ContentType: header("content-type"),
        ContentDisposition: header("content-disposition"),
        CacheControl: header("cache-control"),
        StorageClass: header("x-amz-storage-class") as
          PutObjectCommand["input"]["StorageClass"] | undefined,
        Tagging: header("x-amz-tagging"),
        ChecksumSHA256: header("x-amz-checksum-sha256"),
        Metadata: metadata,
      });
    },
  };
}

function s3Exception(name: string, httpStatusCode: number) {
  return new S3ServiceException({
    name,
    $fault: httpStatusCode >= 500 ? "server" : "client",
    $metadata: { httpStatusCode },
    message: name,
  });
}

function headFields(object: MemoryObject, withChecksum: boolean) {
  return {
    ContentType: object.contentType,
    ContentDisposition: object.contentDisposition,
    CacheControl: object.cacheControl,
    StorageClass: object.storageClass,
    ETag: object.eTag,
    LastModified: object.lastModified,
    Metadata: { ...object.metadata },
    ...(withChecksum && object.checksum
      ? { ChecksumSHA256: object.checksum }
      : {}),
  };
}

/**
 * S3 rejects metadata over 2 KB, and HTTP clients reject non-ASCII header
 * values before the request is sent.
 */
function checkedMetadata(
  metadata: Record<string, string> | undefined,
): Record<string, string> {
  const entries = Object.entries(lowercaseKeys(metadata ?? {}));
  let bytes = 0;
  for (const [key, value] of entries) {
    if (!PRINTABLE_ASCII.test(value)) {
      throw new TypeError(
        `Invalid character in header content ["x-amz-meta-${key}"]`,
      );
    }
    bytes += Buffer.byteLength(key) + Buffer.byteLength(value);
  }
  if (bytes > MAX_METADATA_BYTES) throw s3Exception("MetadataTooLarge", 400);
  return Object.fromEntries(entries);
}

function lowercaseKeys(record: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key.toLowerCase(), value]),
  );
}

async function assertChecksum(body: Uint8Array, checksum: string | undefined) {
  if (
    checksum !== undefined &&
    checksum !== (await sha256Base64(body.slice()))
  ) {
    throw s3Exception("BadDigest", 400);
  }
}

async function compositeChecksum(parts: readonly MemoryPart[]) {
  const digests = parts.map((part) =>
    Buffer.from(part.checksum ?? "", "base64"),
  );
  return `${await sha256Base64(concat(digests))}-${parts.length}`;
}

/** RFC 9110 order: If-Match, If-Unmodified-Since, If-None-Match, If-Modified-Since. */
function assertPreconditions(
  object: MemoryObject,
  input: GetObjectCommand["input"],
) {
  const modified = (since: Date) =>
    Math.floor(object.lastModified.getTime() / 1000) >
    Math.floor(since.getTime() / 1000);
  if (input.IfMatch !== undefined && !etagMatches(input.IfMatch, object.eTag)) {
    throw s3Exception("PreconditionFailed", 412);
  }
  if (
    input.IfMatch === undefined &&
    input.IfUnmodifiedSince !== undefined &&
    modified(input.IfUnmodifiedSince)
  ) {
    throw s3Exception("PreconditionFailed", 412);
  }
  if (input.IfNoneMatch !== undefined) {
    if (etagMatches(input.IfNoneMatch, object.eTag)) {
      throw s3Exception("NotModified", 304);
    }
  } else if (
    input.IfModifiedSince !== undefined &&
    !modified(input.IfModifiedSince)
  ) {
    throw s3Exception("NotModified", 304);
  }
}

function etagMatches(header: string, eTag: string): boolean {
  const bare = (value: string) => value.trim().replace(/^W\//, "");
  return header
    .split(",")
    .some((candidate) => bare(candidate) === "*" || bare(candidate) === eTag);
}

/**
 * A single `bytes=a-b`, `bytes=a-` or `bytes=-n` range. `undefined` ignores
 * the header (S3 serves the whole object); `null` is unsatisfiable.
 */
function parseRange(
  header: string,
  size: number,
): { start: number; end: number } | null | undefined {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (match[1] === "" && match[2] === "")) return undefined;
  if (match[1] === "") {
    const suffix = Number(match[2]);
    if (suffix === 0 || size === 0) return null;
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(match[1]);
  const end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
  if (start >= size || start > end) return null;
  return { start, end };
}

/** The parts of the SDK's streaming body mixin that callers use. */
function sdkBody(bytes: Uint8Array) {
  return {
    transformToByteArray: async () => bytes.slice(),
    transformToString: async (encoding?: string) =>
      new TextDecoder(encoding).decode(bytes),
    transformToWebStream: () => new Blob([bytes.slice()]).stream(),
  };
}

function toBytes(body: BodyInput): Uint8Array {
  if (typeof body === "string") return new TextEncoder().encode(body);
  return body instanceof ArrayBuffer ? new Uint8Array(body) : body;
}

async function readBody(body: unknown): Promise<Uint8Array> {
  if (body === undefined || body === null) return new Uint8Array();
  if (typeof body === "string" || body instanceof ArrayBuffer) {
    return toBytes(body);
  }
  if (body instanceof Uint8Array) return body;
  if (body instanceof Blob) return new Uint8Array(await body.arrayBuffer());
  if (body instanceof ReadableStream) {
    return new Uint8Array(await new Response(body).arrayBuffer());
  }
  if (typeof body === "object" && Symbol.asyncIterator in body) {
    const chunks: Uint8Array[] = [];
    for await (const chunk of body as AsyncIterable<Uint8Array | string>) {
      chunks.push(toBytes(chunk));
    }
    return concat(chunks);
  }
  throw new TypeError("memoryS3: unsupported body type");
}

function concat(chunks: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(chunks.reduce((n, chunk) => n + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function md5(bytes: Uint8Array): Uint8Array {
  return createHash("md5").update(bytes).digest();
}

function quotedMd5(bytes: Uint8Array): string {
  return `"${createHash("md5").update(bytes).digest("hex")}"`;
}
