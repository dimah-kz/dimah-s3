import { GetObjectCommand, S3ServiceException } from "@aws-sdk/client-s3";
import {
  buildContentDisposition,
  isAPIError,
  s3Error,
  type APIError,
} from "@dimah-s3/core";
import { describe, expect, it, vi } from "vitest";
import { resolveRoutes } from "@/helpers/features";
import { route } from "@/route";
import {
  memoryS3,
  TEST_BUCKET,
  testConfig,
  testDownload,
  testRoute,
  type MemoryS3,
} from "@/test/harness";
import type {
  DownloadConfig,
  DownloadGuardContext,
  DownloadResolveContext,
  DownloadResolveInfo,
} from "@/types";
import type { ResolvedConfig, ResolvedDownload } from "@/types/resolved";
import { serveFile, type FileQuery } from "./file";

const KEY = "uploads/a.png";
const BODY = "0123456789";
const LAST_MODIFIED = new Date("2026-01-01T00:00:00.000Z");
const CSP =
  "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox";

function seeded(): MemoryS3 {
  const s3 = memoryS3();
  s3.seed(KEY, BODY, {
    contentType: "image/png",
    contentDisposition: buildContentDisposition("a.png"),
    lastModified: LAST_MODIFIED,
  });
  return s3;
}

function setup(
  download: Partial<ResolvedDownload> = {},
  config: Partial<ResolvedConfig> = {},
) {
  const s3 = seeded();
  const resolved = testConfig({
    routes: {
      uploads: testRoute({
        client: s3.client,
        download: testDownload({ mode: "proxy", ...download }),
      }),
    },
    ...config,
  });
  return { s3, config: resolved };
}

/** Like {@link setup}, with the route resolved from config like `dimahS3()`. */
function setupFromConfig(download: DownloadConfig) {
  const s3 = seeded();
  const maxExpiresIn = 604_800;
  const config = testConfig({
    maxExpiresIn,
    routes: resolveRoutes(
      {
        client: s3.client,
        bucket: TEST_BUCKET,
        routes: { uploads: route({ download }) },
      },
      { maxExpiresIn },
    ),
  });
  return { s3, config };
}

function serve(
  config: ResolvedConfig,
  options: {
    query?: Partial<FileQuery>;
    headers?: HeadersInit;
    signal?: AbortSignal;
  } = {},
): Promise<Response> {
  const request = new Request("http://localhost/api/s3/file", {
    headers: options.headers,
    signal: options.signal,
  });
  return serveFile(
    config,
    { route: "uploads", key: KEY, ...options.query },
    { request },
  );
}

async function failure(promise: Promise<unknown>): Promise<APIError> {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  if (!isAPIError(error)) throw new Error("expected an APIError");
  return error;
}

function expectFileHeaders(
  headers: HeadersInit,
  cacheControl = "private, no-cache",
) {
  const actual = new Headers(headers);
  expect(actual.get("content-security-policy")).toBe(CSP);
  expect(actual.get("x-content-type-options")).toBe("nosniff");
  expect(actual.get("cross-origin-resource-policy")).toBe("same-origin");
  expect(actual.get("cache-control")).toBe(cacheControl);
  expect(actual.get("accept-ranges")).toBe("bytes");
}

/** Inputs of every GetObject sent so far. */
function getObjectInputs(s3: MemoryS3) {
  return s3.send.mock.calls
    .map(([command]) => command)
    .filter((command) => command instanceof GetObjectCommand)
    .map((command) => command.input);
}

function s3Exception(
  name: string,
  httpStatusCode: number,
  extra: Record<string, unknown> = {},
) {
  return Object.assign(
    new S3ServiceException({
      name,
      $fault: "client",
      $metadata: { httpStatusCode },
      message: name,
    }),
    extra,
  );
}

describe("serveFile response", () => {
  it("streams the object with the full header set", async () => {
    const { s3, config } = setup();

    const response = await serve(config);
    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe(BODY);
    expectFileHeaders(response.headers);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("content-length")).toBe("10");
    expect(response.headers.get("content-disposition")).toBe(
      buildContentDisposition("a.png", "attachment"),
    );
    expect(response.headers.get("etag")).toBe(s3.get(KEY)?.eTag);
    expect(response.headers.get("last-modified")).toBe(
      LAST_MODIFIED.toUTCString(),
    );
    expect(response.headers.has("content-range")).toBe(false);
  });

  it("uses the requested name and the Cache-Control from download.resolve", async () => {
    const { config } = setup({
      resolve: () => ({ cacheControl: "private, max-age=60" }),
    });

    const response = await serve(config, { query: { name: "photo.png" } });
    expectFileHeaders(response.headers, "private, max-age=60");
    expect(response.headers.get("content-disposition")).toBe(
      buildContentDisposition("photo.png", "attachment"),
    );
  });

  it("runs the guards, then sends a single GetObject", async () => {
    const order: string[] = [];
    const resolve = vi.fn<
      (context: DownloadResolveContext) => DownloadResolveInfo
    >(() => {
      order.push(`resolve:${s3.send.mock.calls.length}`);
      return { name: "named.png" };
    });
    const guard = vi.fn<(context: DownloadGuardContext) => void>(() => {
      order.push(`guard:${s3.send.mock.calls.length}`);
    });
    const { s3, config } = setup({ resolve, guard: [{ hook: guard }] });

    await serve(config, { query: { disposition: "inline" } });
    expect(order).toEqual(["resolve:0", "guard:0"]);
    expect(s3.send).toHaveBeenCalledOnce();
    expect(s3.send.mock.calls[0][0]).toBeInstanceOf(GetObjectCommand);
    const object = {
      operation: "file",
      route: "uploads",
      key: KEY,
      bucket: TEST_BUCKET,
      mode: "proxy",
      disposition: "inline",
    };
    expect(resolve.mock.calls[0][0]).toMatchObject(object);
    expect(resolve.mock.calls[0][0]).not.toHaveProperty("expiresIn");
    expect(guard.mock.calls[0][0]).toMatchObject({
      ...object,
      name: "named.png",
    });
  });
});

describe("serveFile inline types", () => {
  it("sends PDF as an attachment by default", async () => {
    const { s3, config } = setupFromConfig({ mode: "proxy" });
    s3.seed("uploads/plan.pdf", "%PDF-1.7", {
      contentType: "application/pdf",
    });

    const response = await serve(config, {
      query: { key: "uploads/plan.pdf", disposition: "inline" },
    });
    expect(response.headers.get("content-disposition")).toBe(
      buildContentDisposition("plan.pdf", "attachment"),
    );
    expect(response.headers.get("content-type")).toBe("application/pdf");
  });

  it("keeps inline for an allowed image", async () => {
    const { config } = setupFromConfig({ mode: "proxy" });

    const response = await serve(config, { query: { disposition: "inline" } });
    expect(response.headers.get("content-disposition")).toBe(
      buildContentDisposition("a.png", "inline"),
    );
  });

  it("sends HTML as an attachment with its own type", async () => {
    const { s3, config } = setup({ inlineTypes: ["text/*"] });
    s3.seed("uploads/page.html", "<script></script>", {
      contentType: "text/html",
    });

    const response = await serve(config, {
      query: { key: "uploads/page.html", disposition: "inline" },
    });
    expect(response.headers.get("content-disposition")).toMatch(/^attachment;/);
    expect(response.headers.get("content-type")).toBe("text/html");
    expectFileHeaders(response.headers);
  });

  it("types an untyped inline object from its name", async () => {
    const { s3, config } = setup();
    s3.seed("uploads/blob", BODY, { contentType: "application/octet-stream" });

    const response = await serve(config, {
      query: { key: "uploads/blob", name: "a.png", disposition: "inline" },
    });
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("content-disposition")).toBe(
      buildContentDisposition("a.png", "inline"),
    );
  });
});

describe("serveFile Range", () => {
  it.each([
    ["bytes=2-5", "bytes 2-5/10", "2345"],
    ["bytes=7-", "bytes 7-9/10", "789"],
    ["bytes=-3", "bytes 7-9/10", "789"],
    ["bytes=8-20", "bytes 8-9/10", "89"],
  ])("returns 206 for %s", async (range, contentRange, body) => {
    const { s3, config } = setup();

    const response = await serve(config, { headers: { range } });
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe(contentRange);
    expect(response.headers.get("content-length")).toBe(String(body.length));
    await expect(response.text()).resolves.toBe(body);
    expectFileHeaders(response.headers);
    expect(getObjectInputs(s3)).toEqual([
      expect.objectContaining({ Range: range }),
    ]);
  });

  it.each(["bytes=0-1,4-5", "bytes=5-2", "items=0-1", "bytes=-", "bytes=a-b"])(
    "ignores the Range %s and returns 200",
    async (range) => {
      const { s3, config } = setup();

      const response = await serve(config, { headers: { range } });
      expect(response.status).toBe(200);
      await expect(response.text()).resolves.toBe(BODY);
      expect(getObjectInputs(s3)[0].Range).toBeUndefined();
    },
  );

  it("returns 416 with the object size when S3 cannot satisfy the range", async () => {
    const { config } = setup();

    const error = await failure(
      serve(config, { headers: { range: "bytes=20-" } }),
    );
    expect(error).toMatchObject({
      code: "RANGE_NOT_SATISFIABLE",
      statusCode: 416,
    });
    expect(new Headers(error.headers).get("content-range")).toBe("bytes */10");
    expectFileHeaders(error.headers);
  });

  it("reads the size from S3's InvalidRange error without HeadObject", async () => {
    const { s3, config } = setup();
    s3.send.mockRejectedValueOnce(
      s3Exception("InvalidRange", 416, { ActualObjectSize: "42" }),
    );

    const error = await failure(
      serve(config, { headers: { range: "bytes=50-" } }),
    );
    expect(new Headers(error.headers).get("content-range")).toBe("bytes */42");
    expect(s3.send).toHaveBeenCalledOnce();
  });
});

describe("serveFile conditional requests", () => {
  it("forwards the conditional headers to GetObject", async () => {
    const { s3, config } = setup();
    const since = "Wed, 31 Dec 2025 00:00:00 GMT";

    const response = await serve(config, {
      headers: {
        "if-none-match": '"stale"',
        "if-modified-since": since,
        "if-match": "*",
        "if-unmodified-since": "Fri, 01 Jan 2027 00:00:00 GMT",
      },
    });
    expect(response.status).toBe(200);
    expect(getObjectInputs(s3)[0]).toMatchObject({
      IfNoneMatch: '"stale"',
      IfModifiedSince: new Date(since),
      IfMatch: "*",
      IfUnmodifiedSince: new Date("2027-01-01T00:00:00.000Z"),
    });
  });

  it("ignores an invalid date", async () => {
    const { s3, config } = setup();

    await serve(config, { headers: { "if-modified-since": "yesterday" } });
    expect(getObjectInputs(s3)[0].IfModifiedSince).toBeUndefined();
  });

  it.each([
    {
      name: "if-none-match",
      value: (s3: MemoryS3) => s3.get(KEY)?.eTag ?? "",
    },
    {
      name: "if-modified-since",
      value: () => LAST_MODIFIED.toUTCString(),
    },
  ])("returns a bare 304 for a matching $name", async ({ name, value }) => {
    const { s3, config } = setup();

    const response = await serve(config, { headers: { [name]: value(s3) } });
    expect(response.status).toBe(304);
    expect(response.body).toBeNull();
    expectFileHeaders(response.headers);
    expect(response.headers.has("content-disposition")).toBe(false);
  });

  it("copies ETag and Last-Modified from S3's 304", async () => {
    const { s3, config } = setup({
      resolve: () => ({ cacheControl: "private, max-age=60" }),
    });
    s3.send.mockRejectedValueOnce(
      s3Exception("NotModified", 304, {
        $response: {
          statusCode: 304,
          headers: {
            etag: '"abc"',
            "last-modified": LAST_MODIFIED.toUTCString(),
          },
        },
      }),
    );

    const response = await serve(config, {
      headers: { "if-none-match": '"abc"' },
    });
    expect(response.status).toBe(304);
    expect(response.headers.get("etag")).toBe('"abc"');
    expect(response.headers.get("last-modified")).toBe(
      LAST_MODIFIED.toUTCString(),
    );
    expectFileHeaders(response.headers, "private, max-age=60");
  });

  it("maps S3's 412 to PRECONDITION_FAILED with the file headers", async () => {
    const { config } = setup();

    const error = await failure(
      serve(config, { headers: { "if-match": '"other"' } }),
    );
    expect(error).toMatchObject({
      code: "PRECONDITION_FAILED",
      statusCode: 412,
    });
    expectFileHeaders(error.headers);
  });

  it("keeps the default Cache-Control on errors when download.resolve sets one", async () => {
    const { config } = setup({
      resolve: () => ({ cacheControl: "public, max-age=3600" }),
    });

    const error = await failure(
      serve(config, { headers: { "if-match": '"other"' } }),
    );
    expect(error.code).toBe("PRECONDITION_FAILED");
    expectFileHeaders(error.headers);
  });
});

describe("serveFile If-Range", () => {
  it("serves the range when If-Range matches the ETag", async () => {
    const { s3, config } = setup();

    const response = await serve(config, {
      headers: { range: "bytes=0-1", "if-range": s3.get(KEY)?.eTag ?? "" },
    });
    expect(response.status).toBe(206);
    expect(s3.send).toHaveBeenCalledOnce();
  });

  it("serves the range when If-Range matches Last-Modified", async () => {
    const { config } = setup();

    const response = await serve(config, {
      headers: { range: "bytes=0-1", "if-range": LAST_MODIFIED.toUTCString() },
    });
    expect(response.status).toBe(206);
  });

  it.each([
    { reason: "an old ETag", ifRange: () => '"stale"' },
    {
      reason: "a weak ETag",
      ifRange: (s3: MemoryS3) => `W/${s3.get(KEY)?.eTag}`,
    },
    { reason: "an old date", ifRange: () => "Wed, 31 Dec 2025 00:00:00 GMT" },
  ])("serves the whole object for $reason", async ({ ifRange }) => {
    const { s3, config } = setup();

    const response = await serve(config, {
      headers: { range: "bytes=0-1", "if-range": ifRange(s3) },
    });
    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe(BODY);
    expect(getObjectInputs(s3).map((input) => input.Range)).toEqual([
      "bytes=0-1",
      undefined,
    ]);
  });

  it("ignores If-Range without a Range", async () => {
    const { s3, config } = setup();

    const response = await serve(config, { headers: { "if-range": '"x"' } });
    expect(response.status).toBe(200);
    expect(s3.send).toHaveBeenCalledOnce();
  });
});

describe("serveFile abort and errors", () => {
  it("passes the request signal to GetObject", async () => {
    const { s3, config } = setup();
    const controller = new AbortController();

    await serve(config, { signal: controller.signal });
    const options = s3.send.mock.calls[0][1];
    expect(options?.abortSignal).toBeInstanceOf(AbortSignal);
    controller.abort();
    expect(options?.abortSignal?.aborted).toBe(true);
  });

  it("stops when the client disconnects, without logging", async () => {
    const error = vi.fn();
    const { config } = setup({}, { logger: { error } });
    const controller = new AbortController();
    controller.abort();

    await expect(
      serve(config, { signal: controller.signal }),
    ).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
    expect(error).not.toHaveBeenCalled();
  });

  it("adds the file headers to every error", async () => {
    const { config } = setup({
      guard: [
        {
          hook: (context) => {
            if (context.key === "uploads/secret.png") {
              throw s3Error("FORBIDDEN");
            }
          },
        },
      ],
    });

    const missing = await failure(
      serve(config, { query: { key: "uploads/missing.png" } }),
    );
    expect(missing).toMatchObject({
      code: "OBJECT_NOT_FOUND",
      statusCode: 404,
    });
    expectFileHeaders(missing.headers);

    const forbidden = await failure(
      serve(config, { query: { key: "uploads/secret.png" } }),
    );
    expect(forbidden).toMatchObject({ code: "FORBIDDEN", statusCode: 403 });
    expectFileHeaders(forbidden.headers);
  });

  it("rejects a key outside the route namespace", async () => {
    const { s3, config } = setup();

    await expect(
      serve(config, { query: { key: "avatars/a.png" } }),
    ).rejects.toMatchObject({ code: "KEY_INVALID" });
    expect(s3.send).not.toHaveBeenCalled();
  });
});
