import { S3_MIN_PART_SIZE, s3Error, sha256Base64 } from "@dimah-s3/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  defaultUploadBody,
  memoryS3,
  testConfig,
  testMultipart,
  testRoute,
  testUpload,
} from "@/test/harness";
import type { MultipartGuardContext } from "@/types";
import type { ResolvedConfig, ResolvedUpload } from "@/types/resolved";
import { presignUpload } from "../upload";
import { initMultipart } from "./init";
import { signMultipartPart } from "./sign-part";

const NOW = new Date("2026-01-01T00:00:00.000Z");
/** Two parts: 5 MiB, then 3 bytes. */
const SIZE = S3_MIN_PART_SIZE + 3;

function setup(
  upload: Partial<ResolvedUpload> = {},
  config: Partial<ResolvedConfig> = {},
) {
  const s3 = memoryS3();
  const resolved = testConfig({
    routes: {
      uploads: testRoute({
        client: s3.client,
        upload: testUpload({
          multipart: testMultipart({ partSize: S3_MIN_PART_SIZE }),
          ...upload,
        }),
      }),
    },
    ...config,
  });
  return { s3, config: resolved };
}

async function init(config: ResolvedConfig) {
  return initMultipart(config, { ...defaultUploadBody, size: SIZE });
}

function signedHeaders(url: string): string[] {
  return new URL(url).searchParams.get("X-Amz-SignedHeaders")?.split(";") ?? [];
}

afterEach(() => {
  vi.useRealTimers();
});

describe("signMultipartPart", () => {
  it("signs each part with its layout size and never lists parts", async () => {
    const { s3, config } = setup();
    const { ticket, uploadId, key } = await init(config);
    s3.send.mockClear();

    const first = await signMultipartPart(config, { ticket, partNumber: 1 });
    const last = await signMultipartPart(config, { ticket, partNumber: 2 });

    expect(first).toEqual({
      url: expect.any(String),
      partNumber: 1,
      size: S3_MIN_PART_SIZE,
      expiresIn: 600,
      headers: {},
    });
    expect(last).toMatchObject({ partNumber: 2, size: 3, headers: {} });
    const url = new URL(last.url);
    expect(url.pathname).toBe(`/bucket/${key}`);
    expect(url.searchParams.get("uploadId")).toBe(uploadId);
    expect(url.searchParams.get("partNumber")).toBe("2");
    expect(signedHeaders(last.url)).toEqual(["content-length", "host"]);
    expect(s3.send).not.toHaveBeenCalled();
  });

  it("fails with MULTIPART_PART_INVALID outside the layout", async () => {
    const { config } = setup();
    const { ticket } = await init(config);

    await expect(
      signMultipartPart(config, { ticket, partNumber: 3 }),
    ).rejects.toMatchObject({
      code: "MULTIPART_PART_INVALID",
      statusCode: 400,
      params: { partNumber: 3, partCount: 2 },
    });
  });

  it("requires and signs a part checksum when the ticket requires one", async () => {
    const { config } = setup({ checksum: true });
    const { ticket } = await init(config);

    await expect(
      signMultipartPart(config, { ticket, partNumber: 1 }),
    ).rejects.toMatchObject({ code: "CHECKSUM_REQUIRED", statusCode: 400 });

    const checksum = await sha256Base64(new Uint8Array(3));
    const signed = await signMultipartPart(config, {
      ticket,
      partNumber: 2,
      checksum,
    });
    expect(signed.headers).toEqual({ "x-amz-checksum-sha256": checksum });
    expect(signedHeaders(signed.url)).toEqual([
      "content-length",
      "host",
      "x-amz-checksum-sha256",
    ]);
    expect(new URL(signed.url).searchParams.has("x-amz-checksum-sha256")).toBe(
      false,
    );
  });

  it("ignores a checksum the ticket does not require", async () => {
    const { config } = setup();
    const { ticket } = await init(config);

    const signed = await signMultipartPart(config, {
      ticket,
      partNumber: 2,
      checksum: await sha256Base64(new Uint8Array(3)),
    });
    expect(signed.headers).toEqual({});
    expect(signedHeaders(signed.url)).toEqual(["content-length", "host"]);
  });

  it("runs the route guard, then upload.multipart.guard with the part", async () => {
    const order: string[] = [];
    const guard = vi.fn<(context: MultipartGuardContext) => void>(() => {
      order.push("multipart");
    });
    const { config } = setup();
    const uploads = config.routes.uploads;
    const withGuards: ResolvedConfig = {
      ...config,
      routes: {
        uploads: {
          ...uploads,
          guard: [{ hook: () => void order.push("route") }],
          upload: testUpload({
            multipart: testMultipart({
              partSize: S3_MIN_PART_SIZE,
              guard: [{ hook: guard }],
            }),
          }),
        },
      },
    };
    const { ticket, uploadId, key } = await init(withGuards);
    order.length = 0;

    await signMultipartPart(withGuards, { ticket, partNumber: 2 });
    expect(order).toEqual(["route", "multipart"]);
    expect(guard.mock.calls[0][0]).toMatchObject({
      operation: "multipart.signPart",
      route: "uploads",
      key,
      uploadId,
      uploadToken: expect.any(String),
      file: { name: "a.png", size: SIZE, type: "image/png" },
      action: "part",
      partNumber: 2,
      size: 3,
    });
  });

  it("stops when upload.multipart.guard rejects", async () => {
    const { config } = setup({
      multipart: testMultipart({
        partSize: S3_MIN_PART_SIZE,
        guard: [
          {
            hook: () => {
              throw s3Error("FORBIDDEN");
            },
          },
        ],
      }),
    });
    const { ticket } = await init(config);

    await expect(
      signMultipartPart(config, { ticket, partNumber: 1 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects an expired ticket", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const { config } = setup({
      multipart: testMultipart({
        partSize: S3_MIN_PART_SIZE,
        ticketExpiresIn: 60,
      }),
    });
    const { ticket } = await init(config);

    vi.setSystemTime(NOW.getTime() + 60_000);
    await expect(
      signMultipartPart(config, { ticket, partNumber: 1 }),
    ).resolves.toMatchObject({ partNumber: 1 });

    vi.setSystemTime(NOW.getTime() + 61_000);
    await expect(
      signMultipartPart(config, { ticket, partNumber: 1 }),
    ).rejects.toMatchObject({ code: "UPLOAD_TICKET_EXPIRED", statusCode: 410 });
  });

  it("rejects a single-shot ticket", async () => {
    const { config } = setup();
    const { ticket } = await presignUpload(config, defaultUploadBody);

    await expect(
      signMultipartPart(config, { ticket, partNumber: 1 }),
    ).rejects.toMatchObject({ code: "UPLOAD_TICKET_INVALID", statusCode: 403 });
  });

  it("rejects a bound ticket for another subject", async () => {
    const { config } = setup(
      {},
      {
        ticketSubject: ({ request }) =>
          request.headers.get("x-user") ?? undefined,
      },
    );
    const { ticket } = await initMultipart(
      config,
      { ...defaultUploadBody, size: SIZE },
      { headers: { "x-user": "alice" } },
    );

    await expect(
      signMultipartPart(
        config,
        { ticket, partNumber: 1 },
        { headers: { "x-user": "bob" } },
      ),
    ).rejects.toMatchObject({ code: "UPLOAD_TICKET_INVALID" });
    await expect(
      signMultipartPart(
        config,
        { ticket, partNumber: 1 },
        { headers: { "x-user": "alice" } },
      ),
    ).resolves.toMatchObject({ partNumber: 1 });
  });

  it("binds the subject at init before upload.guard changes locals", async () => {
    const { config } = setup(
      {
        guard: [{ hook: () => ({ locals: { userId: "from-upload-guard" } }) }],
      },
      {
        guard: [
          {
            hook: ({ request }) => ({
              locals: { userId: request.headers.get("x-user") ?? undefined },
            }),
          },
        ],
        ticketSubject: ({ locals }) => locals.userId,
      },
    );
    const headers = { "x-user": "alice" };
    const { ticket } = await initMultipart(
      config,
      { ...defaultUploadBody, size: SIZE },
      { headers },
    );

    await expect(
      signMultipartPart(config, { ticket, partNumber: 1 }, { headers }),
    ).resolves.toMatchObject({ partNumber: 1 });
  });

  it("fails with FEATURE_DISABLED once multipart is turned off", async () => {
    const { s3, config } = setup();
    const { ticket } = await init(config);
    const disabled = testConfig({
      routes: {
        uploads: testRoute({
          client: s3.client,
          upload: testUpload({ multipart: { enabled: false } }),
        }),
      },
    });

    await expect(
      signMultipartPart(disabled, { ticket, partNumber: 1 }),
    ).rejects.toMatchObject({ code: "FEATURE_DISABLED" });
  });
});
