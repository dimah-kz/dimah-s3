import { s3Error } from "@dimah-s3/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConfigError } from "@/helpers/error-boundary";
import { createLocals } from "@/helpers/hooks";
import {
  testConfig,
  testMultipart,
  testRoute,
  testUpload,
} from "@/test/harness";
import type { GuardContext, S3Operation } from "@/types/hook-contexts";
import type { ResolvedConfig, ResolvedRoute } from "@/types/resolved";
import {
  assertFeature,
  getRoute,
  openObject,
  openRoute,
  openTicket,
  openUploadTarget,
} from "./resolve-route";
import { issueTicket, type UploadTicketInput } from "./ticket";

const UUID = "11111111-1111-1111-1111-111111111111";

function guardContext(operation: S3Operation = "upload"): GuardContext {
  return {
    request: new Request("http://localhost/api/s3"),
    operation,
    locals: createLocals(),
  };
}

function configWith(route: Partial<ResolvedRoute>, extra = {}) {
  return testConfig({ routes: { uploads: testRoute(route) }, ...extra });
}

beforeEach(() => {
  vi.spyOn(crypto, "randomUUID").mockReturnValue(UUID);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("getRoute / assertFeature", () => {
  it("returns a configured route", () => {
    const config = testConfig();
    expect(getRoute(config, "uploads")).toBe(config.routes.uploads);
  });

  it.each(["missing", "toString", "constructor"])(
    "rejects %j with UNKNOWN_ROUTE",
    (name) => {
      expect(() => getRoute(testConfig(), name)).toThrow(
        expect.objectContaining({
          code: "UNKNOWN_ROUTE",
          statusCode: 404,
          params: { route: name },
        }),
      );
    },
  );

  it("rejects a disabled feature with FEATURE_DISABLED", () => {
    const route = testRoute({
      download: { enabled: false },
      upload: testUpload({ multipart: { enabled: false } }),
    });
    expect(() => assertFeature(route, "upload")).not.toThrow();
    for (const feature of ["download", "multipart"] as const) {
      expect(() => assertFeature(route, feature)).toThrow(
        expect.objectContaining({
          code: "FEATURE_DISABLED",
          params: { feature },
        }),
      );
    }
  });
});

describe("openRoute / openObject", () => {
  it("runs the route guard with the route name and shared locals", async () => {
    const guard = vi.fn(() => ({ locals: { role: "admin" } }));
    const ctx = guardContext("download");
    const { route, context } = await openRoute(
      configWith({ guard: [{ hook: guard }] }),
      ctx,
      "uploads",
      "download",
    );

    expect(route.name).toBe("uploads");
    expect(guard).toHaveBeenCalledWith({ ...ctx, route: "uploads" });
    expect(context.locals).toBe(ctx.locals);
    expect({ ...ctx.locals }).toEqual({ role: "admin" });
  });

  it("checks the feature before the route guard", async () => {
    const guard = vi.fn();
    await expect(
      openRoute(
        configWith({ guard: [{ hook: guard }], delete: { enabled: false } }),
        guardContext("delete"),
        "uploads",
        "delete",
      ),
    ).rejects.toMatchObject({ code: "FEATURE_DISABLED" });
    expect(guard).not.toHaveBeenCalled();
  });

  it("adds the stored key and bucket", async () => {
    const { context } = await openObject(
      testConfig(),
      guardContext("download"),
      { route: "uploads", key: "/uploads/a.png" },
      "download",
    );
    expect(context).toMatchObject({
      route: "uploads",
      key: "uploads/a.png",
      bucket: "bucket",
    });
  });

  it("rejects a key outside the route namespace", async () => {
    await expect(
      openObject(
        testConfig(),
        guardContext("delete"),
        { route: "uploads", key: "avatars/a.png" },
        "delete",
      ),
    ).rejects.toMatchObject({ code: "KEY_INVALID" });
  });
});

describe("openUploadTarget", () => {
  const file = { name: "a.png", size: 10, type: "image/png" };

  it("builds the upload guard context, token and S3 metadata", async () => {
    const object = vi.fn(() => ({
      metadata: { author: "José" },
      cacheControl: "max-age=60",
    }));
    const ctx = guardContext();
    const target = await openUploadTarget(
      configWith({ upload: testUpload({ object }) }),
      ctx,
      { route: "uploads", file, clientMetadata: { folder: "docs" } },
      "put",
    );

    expect(object).toHaveBeenCalledWith({
      ...ctx,
      route: "uploads",
      file,
      bucket: "bucket",
      keyPrefix: "uploads",
      clientMetadata: { folder: "docs" },
    });
    expect(target.uploadToken).toMatch(/^[\w-]{22}$/);
    expect(target.context).toEqual({
      ...ctx,
      route: "uploads",
      key: `uploads/${UUID}/a.png`,
      bucket: "bucket",
      kind: "put",
      file,
      acl: "private",
      metadata: { author: "José" },
      clientMetadata: { folder: "docs" },
      storageClass: undefined,
      cacheControl: "max-age=60",
      tagging: undefined,
    });
    expect(target.s3Metadata).toEqual({
      author: "=?UTF-8?B?Sm9zw6k=?=",
      "dimah-upload": target.uploadToken,
    });
  });

  it("checks the declared file before object()", async () => {
    const object = vi.fn();
    await expect(
      openUploadTarget(
        configWith({ upload: testUpload({ object, fileTypes: ["image/*"] }) }),
        guardContext(),
        { route: "uploads", file: { name: "a.pdf", size: 1 } },
        "put",
      ),
    ).rejects.toMatchObject({ code: "FILE_TYPE_NOT_ALLOWED" });
    expect(object).not.toHaveBeenCalled();
  });

  it("fails with a config error when the metadata is over 2048 bytes", async () => {
    const object = () => ({ metadata: { big: "x".repeat(2048) } });
    await expect(
      openUploadTarget(
        configWith({ upload: testUpload({ object }) }),
        guardContext(),
        { route: "uploads", file },
        "post",
      ),
    ).rejects.toBeInstanceOf(ConfigError);
  });

  it("needs multipart on for a multipart upload", async () => {
    const config = configWith({
      upload: testUpload({ multipart: { enabled: false } }),
    });
    await expect(
      openUploadTarget(
        config,
        guardContext("multipart.init"),
        { route: "uploads", file },
        "multipart",
      ),
    ).rejects.toMatchObject({
      code: "FEATURE_DISABLED",
      params: { feature: "multipart" },
    });
    await expect(
      openUploadTarget(
        config,
        guardContext(),
        { route: "uploads", file },
        "put",
      ),
    ).resolves.toMatchObject({ context: { kind: "put" } });
  });

  it("resolves the ticket subject after the route guard", async () => {
    const ticketSubject = vi.fn(
      (ctx: { locals: { userId?: string } }) => ctx.locals.userId,
    );
    const config = configWith(
      { guard: [{ hook: () => ({ locals: { userId: "u1" } }) }] },
      { ticketSubject },
    );

    const target = await openUploadTarget(
      config,
      guardContext(),
      { route: "uploads", file },
      "put",
    );

    expect(target.ticketSubject).toBe("u1");
    expect(ticketSubject).toHaveBeenCalledWith(
      expect.objectContaining({ route: "uploads", operation: "upload" }),
    );
  });

  it("resolves no ticket subject for s3.put", async () => {
    const ticketSubject = vi.fn(() => "u1");
    const target = await openUploadTarget(
      configWith({}, { ticketSubject }),
      guardContext("put"),
      { route: "uploads", file },
      "server",
    );

    expect(target.ticketSubject).toBeUndefined();
    expect(ticketSubject).not.toHaveBeenCalled();
  });
});

describe("openTicket", () => {
  const single: UploadTicketInput = {
    mode: "single",
    id: "token-1",
    route: "uploads",
    key: "uploads/abc/a.png",
    file: { name: "a.png", size: 10, type: "image/png" },
    acl: "private",
    checksum: false,
    expiresAt: new Date(Date.now() + 60_000),
  };

  async function ticketFor(
    config: ResolvedConfig,
    input: Partial<UploadTicketInput> = {},
    subject?: string,
  ) {
    const { ticket } = await issueTicket(
      config,
      { ...single, ...input } as UploadTicketInput,
      subject,
    );
    return ticket;
  }

  it("opens the route and object a ticket names", async () => {
    const guard = vi.fn();
    const config = configWith({ guard: [{ hook: guard }] });
    const ctx = guardContext("confirm");
    const opened = await openTicket(
      config,
      ctx,
      await ticketFor(config),
      "upload",
    );

    expect(opened.ticket).toMatchObject({ id: "token-1", mode: "single" });
    expect(opened.context).toEqual({
      ...ctx,
      route: "uploads",
      key: "uploads/abc/a.png",
      bucket: "bucket",
    });
    expect(guard).toHaveBeenCalledOnce();
  });

  it("opens a multipart ticket for a multipart call", async () => {
    const config = configWith({
      upload: testUpload({ multipart: testMultipart() }),
    });
    const ticket = await ticketFor(config, {
      mode: "multipart",
      uploadId: "upload-1",
      partSize: 5_242_880,
      partCount: 1,
    });

    await expect(
      openTicket(
        config,
        guardContext("multipart.signPart"),
        ticket,
        "multipart",
      ),
    ).resolves.toMatchObject({ ticket: { uploadId: "upload-1" } });
    await expect(
      openTicket(config, guardContext("confirm"), ticket, "upload"),
    ).rejects.toMatchObject({ code: "UPLOAD_TICKET_INVALID" });
  });

  it.each([
    ["a route that no longer exists", { route: "gone" }],
    ["a prototype key as the route", { route: "toString" }],
    ["a key outside the route namespace", { key: "avatars/a.png" }],
  ])("rejects %s as UPLOAD_TICKET_INVALID", async (_, input) => {
    const config = testConfig();
    await expect(
      openTicket(
        config,
        guardContext("confirm"),
        await ticketFor(config, input),
        "upload",
      ),
    ).rejects.toMatchObject({ code: "UPLOAD_TICKET_INVALID", statusCode: 403 });
  });

  it("rejects a ticket before the route guard runs", async () => {
    const guard = vi.fn();
    await expect(
      openTicket(
        configWith({ guard: [{ hook: guard }] }),
        guardContext("confirm"),
        "v1.forged.ticket",
        "upload",
      ),
    ).rejects.toMatchObject({ code: "UPLOAD_TICKET_INVALID" });
    expect(guard).not.toHaveBeenCalled();
  });

  it("rejects an expired ticket", async () => {
    const config = testConfig();
    const ticket = await ticketFor(config);
    vi.useFakeTimers({ now: Date.now() + 120_000 });

    await expect(
      openTicket(config, guardContext("confirm"), ticket, "upload"),
    ).rejects.toMatchObject({ code: "UPLOAD_TICKET_EXPIRED" });
  });

  it("checks the subject after the route guard", async () => {
    const ticket = await ticketFor(testConfig(), {}, "user-1");
    const ticketSubject = vi.fn(
      (ctx: { locals: { userId?: string } }) => ctx.locals.userId,
    );
    const config = configWith(
      { guard: [{ hook: () => ({ locals: { userId: "user-2" } }) }] },
      { ticketSubject },
    );

    await expect(
      openTicket(config, guardContext("confirm"), ticket, "upload"),
    ).rejects.toMatchObject({ code: "UPLOAD_TICKET_INVALID" });
    expect(ticketSubject).toHaveBeenCalledWith(
      expect.objectContaining({ route: "uploads" }),
    );
  });

  it("passes the route guard's rejection through", async () => {
    const config = configWith({
      guard: [
        {
          hook: () => {
            throw s3Error("UNAUTHORIZED");
          },
        },
      ],
    });
    await expect(
      openTicket(
        config,
        guardContext("confirm"),
        await ticketFor(config),
        "upload",
      ),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
