import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import {
  buildContentDisposition,
  s3Error,
  SNIFF_BYTE_LENGTH,
  sha256Base64,
  type UploadPresignResponse,
} from "@dimah-s3/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  defaultUploadBody,
  memoryS3,
  TEST_BUCKET,
  testConfig,
  testRoute,
  testUpload,
  type MemoryS3,
} from "@/test/harness";
import type {
  UploadConfirmGuardContext,
  UploadOnConfirmedContext,
} from "@/types";
import type { ResolvedConfig, ResolvedUpload } from "@/types/resolved";
import { confirmUpload } from "./confirm";
import { presignUpload, type UploadBody } from "./upload";

const NOW = new Date("2026-01-01T00:00:00.000Z");
const body = new TextEncoder().encode("0123456789");
const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48,
  0x44, 0x52,
]);

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

function marker(presigned: UploadPresignResponse): string {
  return presigned.method === "PUT"
    ? presigned.headers["x-amz-meta-dimah-upload"]
    : presigned.fields["x-amz-meta-dimah-upload"];
}

/** Presigns, then sends the bytes the way the browser would. */
async function upload(
  s3: MemoryS3,
  config: ResolvedConfig,
  options: { body?: Partial<UploadBody>; bytes?: Uint8Array } = {},
) {
  const bytes = options.bytes ?? body;
  const presigned = await presignUpload(config, {
    ...defaultUploadBody,
    size: bytes.length,
    ...options.body,
  });
  await s3.receiveUpload({
    key: presigned.key,
    body: bytes,
    headers: presigned.method === "PUT" ? presigned.headers : presigned.fields,
  });
  return presigned;
}

function commandNames(s3: MemoryS3): string[] {
  return s3.send.mock.calls.map(
    ([command]) => (command as object).constructor.name,
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe("confirmUpload", () => {
  it("returns the object as HeadObject reports it, without internal metadata", async () => {
    const { s3, config } = setup({
      object: () => ({ metadata: { source: "web" } }),
    });
    const presigned = await upload(s3, config);
    const stored = s3.get(presigned.key);

    await expect(
      confirmUpload(config, { ticket: presigned.ticket }),
    ).resolves.toEqual({
      key: presigned.key,
      bucket: TEST_BUCKET,
      name: "a.png",
      size: 10,
      type: "image/png",
      eTag: stored?.eTag.replaceAll('"', ""),
      lastModified: stored?.lastModified.toISOString(),
      metadata: { source: "web" },
      acl: "private",
    });
    expect(stored?.contentDisposition).toBe(buildContentDisposition("a.png"));
  });

  it("runs onConfirmed with the upload token and the verified object", async () => {
    const onConfirmed = vi.fn<(context: UploadOnConfirmedContext) => void>();
    const { s3, config } = setup({ onConfirmed: [{ hook: onConfirmed }] });
    const presigned = await upload(s3, config);

    await confirmUpload(config, { ticket: presigned.ticket });
    expect(onConfirmed).toHaveBeenCalledOnce();
    expect(onConfirmed.mock.calls[0][0]).toMatchObject({
      operation: "confirm",
      route: "uploads",
      key: presigned.key,
      bucket: TEST_BUCKET,
      kind: "put",
      uploadToken: marker(presigned),
      acl: "private",
      object: { name: "a.png", size: 10, type: "image/png", metadata: {} },
    });
    expect(onConfirmed.mock.calls[0][0].uploadId).toBeUndefined();
  });

  it("confirms a POST upload with kind post", async () => {
    const onConfirmed = vi.fn();
    const { s3, config } = setup({
      method: "POST",
      onConfirmed: [{ hook: onConfirmed }],
    });
    const presigned = await upload(s3, config);

    await expect(
      confirmUpload(config, { ticket: presigned.ticket }),
    ).resolves.toMatchObject({ key: presigned.key, size: 10 });
    expect(onConfirmed).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "post" }),
    );
  });

  it("rejects a forged ticket", async () => {
    const { s3, config } = setup();
    const presigned = await upload(s3, config);
    const [version, payload] = presigned.ticket.split(".");

    await expect(
      confirmUpload(config, { ticket: `${version}.${payload}.AAAA` }),
    ).rejects.toMatchObject({ code: "UPLOAD_TICKET_INVALID", statusCode: 403 });
  });

  it("rejects a ticket after the confirm window", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const { s3, config } = setup({ expiresIn: 60, confirmWindow: 120 });
    const presigned = await upload(s3, config);

    vi.setSystemTime(NOW.getTime() + 180_000);
    await expect(
      confirmUpload(config, { ticket: presigned.ticket }),
    ).resolves.toMatchObject({ key: presigned.key });

    vi.setSystemTime(NOW.getTime() + 181_000);
    await expect(
      confirmUpload(config, { ticket: presigned.ticket }),
    ).rejects.toMatchObject({ code: "UPLOAD_TICKET_EXPIRED", statusCode: 410 });
  });

  it("rejects a bound ticket for another subject", async () => {
    const { s3, config } = setup(
      {},
      {
        ticketSubject: ({ request }) =>
          request.headers.get("x-user") ?? undefined,
      },
    );
    const presigned = await presignUpload(config, defaultUploadBody, {
      headers: { "x-user": "alice" },
    });
    await s3.receiveUpload({
      key: presigned.key,
      body,
      headers: presigned.method === "PUT" ? presigned.headers : {},
    });

    await expect(
      confirmUpload(
        config,
        { ticket: presigned.ticket },
        { headers: { "x-user": "bob" } },
      ),
    ).rejects.toMatchObject({ code: "UPLOAD_TICKET_INVALID" });
    await expect(
      confirmUpload(
        config,
        { ticket: presigned.ticket },
        { headers: { "x-user": "alice" } },
      ),
    ).resolves.toMatchObject({ key: presigned.key });
  });

  it("binds the subject before upload.guard, so its locals do not change it", async () => {
    const { s3, config } = setup(
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
    const presigned = await presignUpload(config, defaultUploadBody, {
      headers,
    });
    await s3.receiveUpload({
      key: presigned.key,
      body,
      headers: presigned.method === "PUT" ? presigned.headers : {},
    });

    await expect(
      confirmUpload(config, { ticket: presigned.ticket }, { headers }),
    ).resolves.toMatchObject({ key: presigned.key });
  });
});

describe("confirmUpload marker", () => {
  it("does not confirm or delete a newer upload to the same fixed key", async () => {
    const onConfirmed = vi.fn();
    const { s3, config } = setup({
      object: () => ({ key: "avatar.png" }),
      onConfirmed: [{ hook: onConfirmed }],
    });
    const first = await presignUpload(config, defaultUploadBody);
    const second = await upload(s3, config);
    expect(first.key).toBe("uploads/avatar.png");
    expect(second.key).toBe(first.key);
    s3.send.mockClear();

    await expect(
      confirmUpload(config, { ticket: first.ticket }),
    ).rejects.toMatchObject({ code: "OBJECT_NOT_FOUND", statusCode: 404 });
    expect(commandNames(s3)).toEqual(["HeadObjectCommand"]);
    expect(s3.get(first.key)?.metadata["dimah-upload"]).toBe(marker(second));
    expect(onConfirmed).not.toHaveBeenCalled();

    await expect(
      confirmUpload(config, { ticket: second.ticket }),
    ).resolves.toMatchObject({ key: second.key });
  });

  it("does not confirm or delete an object without a marker", async () => {
    const { s3, config } = setup();
    const presigned = await presignUpload(config, defaultUploadBody);
    s3.seed(presigned.key, body, { contentType: "image/png" });

    await expect(
      confirmUpload(config, { ticket: presigned.ticket }),
    ).rejects.toMatchObject({ code: "OBJECT_NOT_FOUND" });
    expect(s3.get(presigned.key)).toBeDefined();
    expect(commandNames(s3)).not.toContain("DeleteObjectCommand");
  });

  it("fails with OBJECT_NOT_FOUND before the bytes arrive", async () => {
    const { s3, config } = setup();
    const presigned = await presignUpload(config, defaultUploadBody);

    await expect(
      confirmUpload(config, { ticket: presigned.ticket }),
    ).rejects.toMatchObject({ code: "OBJECT_NOT_FOUND", statusCode: 404 });
    expect(commandNames(s3)).toEqual(["HeadObjectCommand"]);
  });
});

describe("confirmUpload verification", () => {
  it("deletes an object whose size differs from the ticket", async () => {
    const { s3, config } = setup();
    const presigned = await presignUpload(config, defaultUploadBody);
    s3.seed(presigned.key, "01234", {
      contentType: "image/png",
      metadata: { "dimah-upload": marker(presigned) },
    });

    await expect(
      confirmUpload(config, { ticket: presigned.ticket }),
    ).rejects.toMatchObject({
      code: "UPLOAD_SIZE_MISMATCH",
      params: { expected: 10, actual: 5 },
    });
    expect(s3.get(presigned.key)).toBeUndefined();
  });

  it("checks the stored name and type against fileTypes", async () => {
    const { s3, config } = setup({ fileTypes: ["image/*"] });
    const presigned = await presignUpload(config, defaultUploadBody);
    s3.seed(presigned.key, body, {
      contentType: "text/html",
      contentDisposition: buildContentDisposition("a.html"),
      metadata: { "dimah-upload": marker(presigned) },
    });

    await expect(
      confirmUpload(config, { ticket: presigned.ticket }),
    ).rejects.toMatchObject({ code: "FILE_TYPE_NOT_ALLOWED" });
    expect(s3.get(presigned.key)).toBeUndefined();
  });

  it("keeps the object and returns 500 when HeadObject has no size", async () => {
    const { s3, config } = setup();
    const presigned = await upload(s3, config);
    s3.send.mockResolvedValueOnce({
      Metadata: { "dimah-upload": marker(presigned) },
    });

    await expect(
      confirmUpload(config, { ticket: presigned.ticket }),
    ).rejects.toMatchObject({ code: "INTERNAL_ERROR", statusCode: 500 });
    expect(s3.get(presigned.key)).toBeDefined();
  });

  describe("verifyContent", () => {
    function verifySetup(extra: Partial<ResolvedUpload> = {}) {
      return setup({ checksum: true, verifyContent: true, ...extra });
    }

    it("reads the first bytes and confirms content that matches the type", async () => {
      const { s3, config } = verifySetup();
      const presigned = await upload(s3, config, {
        bytes: PNG,
        body: { checksum: await sha256Base64(PNG) },
      });

      await expect(
        confirmUpload(config, { ticket: presigned.ticket }),
      ).resolves.toMatchObject({ key: presigned.key, size: PNG.length });
      const get = s3.send.mock.calls
        .map(([command]) => command)
        .find((command) => command instanceof GetObjectCommand);
      expect(get?.input.Range).toBe(`bytes=0-${SNIFF_BYTE_LENGTH - 1}`);
    });

    it("deletes content that does not match the type before any hook runs", async () => {
      const confirmGuard = vi.fn();
      const onConfirmed = vi.fn();
      const { s3, config } = verifySetup({
        confirmGuard: [{ hook: confirmGuard }],
        onConfirmed: [{ hook: onConfirmed }],
      });
      const presigned = await upload(s3, config, {
        body: { checksum: await sha256Base64(body) },
      });

      await expect(
        confirmUpload(config, { ticket: presigned.ticket }),
      ).rejects.toMatchObject({
        code: "FILE_CONTENT_MISMATCH",
        statusCode: 400,
        params: { type: "image/png", detected: "unknown" },
      });
      expect(s3.get(presigned.key)).toBeUndefined();
      expect(confirmGuard).not.toHaveBeenCalled();
      expect(onConfirmed).not.toHaveBeenCalled();
    });

    it("keeps the object when the content read fails, so a retry confirms it", async () => {
      const { s3, config } = verifySetup();
      const presigned = await upload(s3, config, {
        bytes: PNG,
        body: { checksum: await sha256Base64(PNG) },
      });
      const send = s3.send.getMockImplementation();
      s3.send
        .mockImplementationOnce(async (...args) => send?.(...args))
        .mockRejectedValueOnce(
          Object.assign(new Error("socket hang up"), { code: "ECONNRESET" }),
        );

      await expect(
        confirmUpload(config, { ticket: presigned.ticket }),
      ).rejects.toMatchObject({ code: "S3_NETWORK_ERROR" });
      expect(s3.get(presigned.key)).toBeDefined();

      await expect(
        confirmUpload(config, { ticket: presigned.ticket }),
      ).resolves.toMatchObject({ key: presigned.key, size: PNG.length });
    });
  });
});

describe("confirmUpload confirmGuard", () => {
  it("runs after HeadObject with the declared file", async () => {
    const confirmGuard = vi.fn<(context: UploadConfirmGuardContext) => void>(
      () => {
        expect(commandNames(s3)).toContain("HeadObjectCommand");
      },
    );
    const { s3, config } = setup({ confirmGuard: [{ hook: confirmGuard }] });
    const presigned = await upload(s3, config);

    await confirmUpload(config, { ticket: presigned.ticket });
    expect(confirmGuard).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "confirm",
        kind: "put",
        key: presigned.key,
        uploadToken: marker(presigned),
        file: { name: "a.png", size: 10, type: "image/png" },
      }),
    );
  });

  it("deletes the object when it rejects, and keeps previousKey", async () => {
    const onConfirmed = vi.fn();
    const { s3, config } = setup({
      object: () => ({ previousKey: "old.png" }),
      confirmGuard: [
        {
          hook: () => {
            throw s3Error("FORBIDDEN");
          },
        },
      ],
      onConfirmed: [{ hook: onConfirmed }],
    });
    s3.seed("uploads/old.png", "old");
    const presigned = await upload(s3, config);

    await expect(
      confirmUpload(config, { ticket: presigned.ticket }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", statusCode: 403 });
    expect(s3.get(presigned.key)).toBeUndefined();
    expect(s3.get("uploads/old.png")).toBeDefined();
    expect(onConfirmed).not.toHaveBeenCalled();
  });

  it("keeps the object when it throws a plain Error", async () => {
    const confirmGuard = vi
      .fn<(context: UploadConfirmGuardContext) => void>()
      .mockImplementationOnce(() => {
        throw new Error("database down");
      });
    const { s3, config } = setup({ confirmGuard: [{ hook: confirmGuard }] });
    const presigned = await upload(s3, config);

    await expect(
      confirmUpload(config, { ticket: presigned.ticket }),
    ).rejects.toMatchObject({ code: "INTERNAL_ERROR", statusCode: 500 });
    expect(s3.get(presigned.key)).toBeDefined();

    await expect(
      confirmUpload(config, { ticket: presigned.ticket }),
    ).resolves.toMatchObject({ key: presigned.key });
  });
});

describe("confirmUpload onConfirmed failure rules", () => {
  it("runs plugin hooks before the user hook", async () => {
    const order: string[] = [];
    const { s3, config } = setup({
      onConfirmed: [
        { plugin: "db", hook: () => void order.push("db") },
        { plugin: "audit", hook: () => void order.push("audit") },
        { hook: () => void order.push("user") },
      ],
    });
    const presigned = await upload(s3, config);

    await confirmUpload(config, { ticket: presigned.ticket });
    expect(order).toEqual(["db", "audit", "user"]);
  });

  it("deletes the object and returns the error when a plugin hook throws", async () => {
    const user = vi.fn();
    const { s3, config } = setup({
      onConfirmed: [
        {
          plugin: "db",
          hook: () => {
            throw s3Error("QUOTA_EXCEEDED", { limit: "bytes" });
          },
        },
        { hook: user },
      ],
    });
    const presigned = await upload(s3, config);

    await expect(
      confirmUpload(config, { ticket: presigned.ticket }),
    ).rejects.toMatchObject({
      code: "QUOTA_EXCEEDED",
      statusCode: 403,
      params: { limit: "bytes" },
    });
    expect(s3.get(presigned.key)).toBeUndefined();
    expect(user).not.toHaveBeenCalled();
  });

  it("keeps the object and returns a logged 500 when the user hook throws", async () => {
    const error = vi.fn();
    const onError = vi.fn();
    const failure = new Error("webhook failed");
    const tokens: string[] = [];
    let fail = true;
    const { s3, config } = setup(
      {
        onConfirmed: [
          {
            hook: ({ uploadToken }) => {
              tokens.push(uploadToken);
              if (fail) throw failure;
            },
          },
        ],
      },
      { logger: { error }, onError },
    );
    const presigned = await upload(s3, config);

    await expect(
      confirmUpload(config, { ticket: presigned.ticket }),
    ).rejects.toMatchObject({ code: "INTERNAL_ERROR", statusCode: 500 });
    expect(s3.get(presigned.key)).toBeDefined();
    expect(error).toHaveBeenCalledWith("webhook failed", failure);
    expect(onError).toHaveBeenCalledWith(failure, {
      request: expect.any(Request),
    });
    expect(commandNames(s3)).not.toContain("DeleteObjectCommand");

    fail = false;
    await expect(
      confirmUpload(config, { ticket: presigned.ticket }),
    ).resolves.toMatchObject({ key: presigned.key });
    expect(tokens).toEqual([marker(presigned), marker(presigned)]);
  });

  it("returns 500 when the user hook throws an APIError, and keeps the object", async () => {
    const onError = vi.fn();
    const forbidden = s3Error("FORBIDDEN");
    const { s3, config } = setup(
      {
        onConfirmed: [
          {
            hook: () => {
              throw forbidden;
            },
          },
        ],
      },
      { onError },
    );
    const presigned = await upload(s3, config);

    await expect(
      confirmUpload(config, { ticket: presigned.ticket }),
    ).rejects.toMatchObject({ code: "INTERNAL_ERROR", statusCode: 500 });
    expect(s3.get(presigned.key)).toBeDefined();
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ cause: forbidden }),
      { request: expect.any(Request) },
    );
  });

  it("replays every hook on a repeated confirm with the same upload token", async () => {
    const onConfirmed = vi.fn();
    const { s3, config } = setup({
      onConfirmed: [{ plugin: "db", hook: onConfirmed }],
    });
    const presigned = await upload(s3, config);

    const first = await confirmUpload(config, { ticket: presigned.ticket });
    const second = await confirmUpload(config, { ticket: presigned.ticket });
    expect(second).toEqual(first);
    expect(onConfirmed).toHaveBeenCalledTimes(2);
    expect(
      onConfirmed.mock.calls.map(([context]) => context.uploadToken),
    ).toEqual([marker(presigned), marker(presigned)]);
  });
});

describe("confirmUpload previousKey", () => {
  it("deletes the previous key after a successful confirm", async () => {
    const { s3, config } = setup({
      object: () => ({ previousKey: "old.png" }),
    });
    s3.seed("uploads/old.png", "old");
    const presigned = await upload(s3, config);

    await confirmUpload(config, { ticket: presigned.ticket });
    expect(s3.get("uploads/old.png")).toBeUndefined();
    expect(s3.get(presigned.key)).toBeDefined();
  });

  it("ignores a stored previous key outside the route namespace", async () => {
    const { s3, config } = setup();
    const presigned = await presignUpload(config, defaultUploadBody);
    s3.seed("secrets/keep.txt", "secret");
    s3.seed(presigned.key, body, {
      contentType: "image/png",
      metadata: {
        "dimah-upload": marker(presigned),
        "dimah-previous-key": "secrets/keep.txt",
      },
    });

    await expect(
      confirmUpload(config, { ticket: presigned.ticket }),
    ).resolves.toMatchObject({ metadata: {} });
    expect(s3.get("secrets/keep.txt")).toBeDefined();
    const deletes = s3.send.mock.calls.filter(
      ([command]) => command instanceof DeleteObjectCommand,
    );
    expect(deletes).toEqual([]);
  });
});

it("sends one HeadObject per confirm", async () => {
  const { s3, config } = setup();
  const presigned = await upload(s3, config);
  s3.send.mockClear();

  await confirmUpload(config, { ticket: presigned.ticket });
  expect(s3.send).toHaveBeenCalledOnce();
  expect(s3.send.mock.calls[0][0]).toBeInstanceOf(HeadObjectCommand);
});
