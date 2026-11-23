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
import { sha256Base64 } from "@dimah-s3/core";

/** An object in {@link MemoryS3}. */
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

export type MemorySeedInit = {
  bucket?: string;
  contentType?: string;
  contentDisposition?: string;
  cacheControl?: string;
  metadata?: Record<string, string>;
  checksum?: string;
  lastModified?: Date;
};

/** An in-memory S3 bucket store, from {@link createMemoryS3}. */
export type MemoryS3 = {
  /**
   * A real `S3Client`, so presigners sign with it offline, whose `send`
   * reads and writes the maps below. Spy on `client.send` to inject a
   * failure.
   */
  client: S3Client;
  /** Objects by `bucket/key`. */
  objects: Map<string, MemoryObject>;
  /** Multipart uploads by upload id. */
  uploads: Map<string, MemoryMultipartUpload>;
  /** Per-key `DeleteObjects` errors, as S3 reports them. */
  deleteErrors: Map<string, { Code: string; Message: string }>;
  get: (key: string, bucket?: string) => MemoryObject | undefined;
  /** Store an object directly, skipping S3's header rules. */
  seed: (key: string, body: BodyInput, init?: MemorySeedInit) => MemoryObject;
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

export type MemoryS3Options = {
  /**
   * The bucket `get`, `seed`, and `receiveUpload` use when they are given
   * none. @default "test-bucket"
   */
  bucket?: string;
};

/**
 * An S3 that keeps objects and multipart uploads in memory, for tests. It
 * serves the commands dimah-s3 sends: put, head, get (with ranges and
 * preconditions), delete, delete many, and every multipart call. It checks
 * SHA-256 checksums, the 2 KB metadata limit, and `If-Match` like S3.
 *
 * Presigned URLs are signed but never fetched: hand the presigned headers
 * or form fields to `receiveUpload` to store what the browser would send.
 * Node.js only.
 *
 * ```ts
 * const storage = createMemoryS3();
 * const s3 = dimahS3({ client: storage.client, bucket: "test-bucket", routes });
 * ```
 */
export function createMemoryS3(options: MemoryS3Options = {}): MemoryS3 {
  const defaultBucket = options.bucket ?? "test-bucket";
  const objects = new Map<string, MemoryObject>();
  const uploads = new Map<string, MemoryMultipartUpload>();
  const deleteErrors = new Map<string, { Code: string; Message: string }>();
  let uploadCount = 0;

  const id = (bucket: string | undefined, key: string | undefined) =>
    `${bucket ?? defaultBucket}/${key ?? ""}`;

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
      bucket: input.Bucket ?? defaultBucket,
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
      const { Bucket, Key, IfMatch } = command.input;
      const object = objects.get(id(Bucket, Key));
      if (
        object &&
        IfMatch !== undefined &&
        !etagMatches(IfMatch, object.eTag)
      ) {
        throw s3Exception("PreconditionFailed", 412);
      }
      objects.delete(id(Bucket, Key));
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
      `createMemoryS3: unsupported command ${(command as object).constructor.name}`,
    );
  }

  const send = async (
    command: unknown,
    sendOptions?: { abortSignal?: AbortSignal },
  ) => {
    sendOptions?.abortSignal?.throwIfAborted();
    return handle(command);
  };

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
        Bucket: bucket ?? defaultBucket,
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

/** Base64 without its `=` padding: S3 accepts a checksum either way. */
function unpadded(value: string): string {
  return value.replace(/=+$/, "");
}

async function assertChecksum(body: Uint8Array, checksum: string | undefined) {
  if (
    checksum !== undefined &&
    unpadded(checksum) !== unpadded(await sha256Base64(body.slice()))
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
  throw new TypeError("createMemoryS3: unsupported body type");
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
