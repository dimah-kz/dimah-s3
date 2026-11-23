import type { S3Client } from "@aws-sdk/client-s3";
import {
  DEFAULT_INLINE_TYPES,
  S3_API_BASE_PATH,
  type S3ErrorCode,
} from "@dimah-s3/core";
import { expect, vi, type Mock } from "vitest";
import { route } from "@/route";
import {
  createMemoryS3,
  type MemoryS3 as PublicMemoryS3,
} from "@/testing/memory-s3";
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
    onRejected: [],
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
// In-memory S3 from `@dimah-s3/server/testing`, with `send` as a spy.
// ---------------------------------------------------------------------------

export type MemoryS3 = PublicMemoryS3 & {
  /** `client.send`. Use `mockImplementationOnce` / `mockRejectedValueOnce` to inject failures. */
  send: Mock<
    (
      command: unknown,
      options?: { abortSignal?: AbortSignal },
    ) => Promise<unknown>
  >;
};

/** {@link createMemoryS3} on the test bucket, with `send` as a spy. */
export function memoryS3(): MemoryS3 {
  const storage = createMemoryS3({ bucket: TEST_BUCKET });
  const send: MemoryS3["send"] = vi.fn(
    storage.client.send.bind(storage.client) as (
      command: unknown,
      options?: { abortSignal?: AbortSignal },
    ) => Promise<unknown>,
  );
  storage.client.send = send as unknown as S3Client["send"];
  return { ...storage, send };
}
