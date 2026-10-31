import { createHmac, hkdfSync } from "node:crypto";
import { base64UrlDecode, uploadTicketSchema } from "@dimah-s3/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConfigError } from "@/helpers/error-boundary";
import { TEST_SECRET } from "@/test/harness";
import type { RouteGuardContext, S3Operation } from "@/types/hook-contexts";
import {
  assertTicketSubject,
  createUploadToken,
  issueTicket,
  parseSecretOption,
  readTicket,
  type TicketEnv,
  type UploadTicketInput,
} from "./ticket";

const OTHER_SECRET = "other-secret-0123456789abcdef-012345678";
const NOW = new Date("2026-10-31T12:00:00Z");
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const DEV_SECRET = Symbol.for("dimah-s3.dev-secret");

function env(overrides: Partial<TicketEnv> = {}): TicketEnv {
  return { secret: [TEST_SECRET], logger: {}, ...overrides };
}

function context(operation: S3Operation = "confirm"): RouteGuardContext {
  return {
    request: new Request("http://localhost/api/s3"),
    operation,
    locals: Object.create(null),
    route: "uploads",
  };
}

const single: UploadTicketInput = {
  mode: "single",
  id: "token-1",
  route: "uploads",
  key: "uploads/abc/a.png",
  file: { name: "a.png", size: 10, type: "image/png" },
  checksum: false,
  expiresAt: new Date(NOW.getTime() + HOUR),
};

const multipart: UploadTicketInput = {
  mode: "multipart",
  id: "token-2",
  route: "uploads",
  key: "uploads/abc/movie.mp4",
  file: { name: "movie.mp4", size: 20_000_000, type: "video/mp4" },
  checksum: true,
  uploadId: "upload-1",
  partSize: 8_388_608,
  partCount: 3,
  expiresAt: new Date(NOW.getTime() + DAY),
};

function decodePayload(ticket: string): Record<string, unknown> {
  const [, payload] = ticket.split(".");
  return JSON.parse(new TextDecoder().decode(base64UrlDecode(payload)));
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("issueTicket / readTicket", () => {
  it("round-trips a single-shot ticket", async () => {
    const { ticket, expiresAt } = await issueTicket(env(), single);

    expect(ticket).toMatch(/^v1\.[\w-]+\.[\w-]+$/);
    expect(expiresAt).toEqual(single.expiresAt);
    await expect(
      readTicket(env(), ticket, { mode: "single", operation: "confirm" }),
    ).resolves.toEqual({
      ...single,
      issuedAt: NOW,
      subjectHash: undefined,
    });
  });

  it("round-trips a multipart ticket", async () => {
    const { ticket } = await issueTicket(env(), multipart);

    await expect(
      readTicket(env(), ticket, {
        mode: "multipart",
        operation: "multipart.signPart",
      }),
    ).resolves.toMatchObject({
      mode: "multipart",
      uploadId: "upload-1",
      partSize: 8_388_608,
      partCount: 3,
      checksum: true,
      file: multipart.file,
    });
  });

  it("uses the documented payload fields", async () => {
    const { ticket } = await issueTicket(env(), multipart);

    expect(decodePayload(ticket)).toEqual({
      id: "token-2",
      r: "uploads",
      k: "uploads/abc/movie.mp4",
      m: "multipart",
      u: "upload-1",
      n: "movie.mp4",
      s: 20_000_000,
      t: "video/mp4",
      ps: 8_388_608,
      pc: 3,
      c: 1,
      iat: NOW.getTime() / 1000,
      exp: (NOW.getTime() + DAY) / 1000,
    });
  });

  it("signs with HMAC-SHA256 under an HKDF-SHA256 key", async () => {
    const { ticket } = await issueTicket(env(), single);
    const [version, payload, signature] = ticket.split(".");

    const key = hkdfSync(
      "sha256",
      TEST_SECRET,
      new Uint8Array(),
      "dimah-s3/upload/v1",
      32,
    );
    const expected = createHmac("sha256", Buffer.from(key))
      .update(`${version}.${payload}`)
      .digest("base64url");
    expect(signature).toBe(expected);
  });

  it("rounds the expiry down to the second", async () => {
    const { ticket, expiresAt } = await issueTicket(env(), {
      ...single,
      expiresAt: new Date(NOW.getTime() + 1500),
    });

    expect(expiresAt).toEqual(new Date(NOW.getTime() + 1000));
    expect(decodePayload(ticket).exp).toBe(NOW.getTime() / 1000 + 1);
  });

  it("stays under the 8192-character schema cap with a 1024-character key and a 255-byte name", async () => {
    const name = `${"é".repeat(125)}.png`;
    expect(new TextEncoder().encode(name)).toHaveLength(254);
    const { ticket } = await issueTicket(env(), {
      ...multipart,
      key: `uploads/${"k".repeat(1016)}`,
      file: { name, size: 1, type: "x".repeat(255) },
    });

    expect(ticket.length).toBeLessThan(8192);
    expect(uploadTicketSchema.parse(ticket)).toBe(ticket);
  });

  it("refuses to issue a ticket over 8192 characters", async () => {
    const issue = issueTicket(env(), {
      ...single,
      key: `uploads/${"\u0001".repeat(1016)}`,
    });

    await expect(issue).rejects.toBeInstanceOf(ConfigError);
    await expect(issue).rejects.toThrow(/Use a shorter object key/);
  });
});

describe("readTicket rejections", () => {
  const INVALID = { code: "UPLOAD_TICKET_INVALID", statusCode: 403 };
  const read = (ticket: string) =>
    readTicket(env(), ticket, { mode: "single", operation: "confirm" });

  it.each([
    ["an empty string", ""],
    ["two parts", "v1.abc"],
    ["four parts", "v1.a.b.c"],
    ["another version", "v2.abc.def"],
    ["a signature that is not base64url", "v1.abc.!!!"],
  ])("rejects %s", async (_, ticket) => {
    await expect(read(ticket)).rejects.toMatchObject(INVALID);
  });

  it("rejects a changed payload", async () => {
    const { ticket } = await issueTicket(env(), single);
    const [version, , signature] = ticket.split(".");
    const forged = Buffer.from(
      JSON.stringify({ ...decodePayload(ticket), s: 999_999 }),
    ).toString("base64url");

    await expect(
      read(`${version}.${forged}.${signature}`),
    ).rejects.toMatchObject(INVALID);
  });

  it("rejects a changed signature", async () => {
    const { ticket } = await issueTicket(env(), single);
    const [version, payload, signature] = ticket.split(".");
    const flipped = signature[0] === "A" ? "B" : "A";

    await expect(
      read(`${version}.${payload}.${flipped}${signature.slice(1)}`),
    ).rejects.toMatchObject(INVALID);
  });

  it("rejects a ticket for the other mode", async () => {
    const { ticket } = await issueTicket(env(), single);

    await expect(
      readTicket(env(), ticket, {
        mode: "multipart",
        operation: "multipart.complete",
      }),
    ).rejects.toMatchObject({ code: "UPLOAD_TICKET_INVALID" });
  });
});

describe("expiry", () => {
  it("accepts a ticket until exp and rejects it after", async () => {
    const { ticket } = await issueTicket(env(), single);
    const read = () =>
      readTicket(env(), ticket, { mode: "single", operation: "confirm" });

    vi.setSystemTime(single.expiresAt);
    await expect(read()).resolves.toMatchObject({ id: "token-1" });

    vi.setSystemTime(single.expiresAt.getTime() + 1000);
    await expect(read()).rejects.toMatchObject({
      code: "UPLOAD_TICKET_EXPIRED",
      statusCode: 410,
    });
  });

  it("lets abort use an expired ticket for 7 more days", async () => {
    const { ticket } = await issueTicket(env(), multipart);
    const read = (operation: S3Operation) =>
      readTicket(env(), ticket, { mode: "multipart", operation });

    vi.setSystemTime(multipart.expiresAt.getTime() + 7 * DAY);
    await expect(read("multipart.abort")).resolves.toMatchObject({
      uploadId: "upload-1",
    });
    await expect(read("multipart.complete")).rejects.toMatchObject({
      code: "UPLOAD_TICKET_EXPIRED",
    });

    vi.setSystemTime(multipart.expiresAt.getTime() + 7 * DAY + 1000);
    await expect(read("multipart.abort")).rejects.toMatchObject({
      code: "UPLOAD_TICKET_EXPIRED",
    });
  });
});

describe("secret rotation", () => {
  it("verifies with every secret and signs with the first", async () => {
    const old = await issueTicket(env(), single);
    const rotated = env({ secret: [OTHER_SECRET, TEST_SECRET] });

    await expect(
      readTicket(rotated, old.ticket, { mode: "single", operation: "confirm" }),
    ).resolves.toMatchObject({ id: "token-1" });

    const next = await issueTicket(rotated, single);
    await expect(
      readTicket(env({ secret: [OTHER_SECRET] }), next.ticket, {
        mode: "single",
        operation: "confirm",
      }),
    ).resolves.toMatchObject({ id: "token-1" });
  });

  it("rejects a ticket once its secret is removed", async () => {
    const { ticket } = await issueTicket(env(), single);

    await expect(
      readTicket(env({ secret: [OTHER_SECRET] }), ticket, {
        mode: "single",
        operation: "confirm",
      }),
    ).rejects.toMatchObject({ code: "UPLOAD_TICKET_INVALID" });
  });
});

describe("subject binding", () => {
  function withSubject(subject: string | undefined, secret = [TEST_SECRET]) {
    return env({ secret, ticketSubject: () => subject });
  }

  async function issueFor(subject: string | undefined) {
    const { ticket } = await issueTicket(env(), single, subject);
    return readTicket(env(), ticket, { mode: "single", operation: "confirm" });
  }

  it("binds a ticket to the subject it is issued for", async () => {
    const { ticket } = await issueTicket(env(), single, "user-1");

    expect(decodePayload(ticket).sb).toMatch(/^[\w-]{22}$/);
  });

  it("issues an unbound ticket without a subject", async () => {
    const ticketSubject = vi.fn(() => "user-1");
    const { ticket } = await issueTicket(env({ ticketSubject }), single);

    expect(decodePayload(ticket).sb).toBeUndefined();
    expect(ticketSubject).not.toHaveBeenCalled();
  });

  it("accepts the same subject", async () => {
    const ticket = await issueFor("user-1");
    await expect(
      assertTicketSubject(withSubject("user-1"), ticket, context()),
    ).resolves.toBeUndefined();
  });

  it.each([
    ["another subject", "user-2"],
    ["no subject", undefined],
  ])("rejects %s", async (_, subject) => {
    const ticket = await issueFor("user-1");
    await expect(
      assertTicketSubject(withSubject(subject), ticket, context()),
    ).rejects.toMatchObject({ code: "UPLOAD_TICKET_INVALID" });
  });

  it("still matches after the secret rotates", async () => {
    const ticket = await issueFor("user-1");
    await expect(
      assertTicketSubject(
        withSubject("user-1", [OTHER_SECRET, TEST_SECRET]),
        ticket,
        context(),
      ),
    ).resolves.toBeUndefined();
  });

  it("does not bind when no subject resolves", async () => {
    const ticketSubject = vi.fn(() => "user-2");
    const ticket = await issueFor(undefined);

    expect(ticket.subjectHash).toBeUndefined();
    await expect(
      assertTicketSubject(env({ ticketSubject }), ticket, context()),
    ).resolves.toBeUndefined();
    expect(ticketSubject).not.toHaveBeenCalled();
  });
});

describe("secrets", () => {
  const read = (ticketEnv: TicketEnv) => issueTicket(ticketEnv, single);

  beforeEach(() => {
    delete (globalThis as { [DEV_SECRET]?: string })[DEV_SECRET];
    vi.stubEnv("DIMAH_S3_SECRET", "");
  });

  it("reads DIMAH_S3_SECRET when no secret is configured", async () => {
    vi.stubEnv("DIMAH_S3_SECRET", TEST_SECRET);
    const { ticket } = await read(env({ secret: undefined }));

    await expect(
      readTicket(env(), ticket, { mode: "single", operation: "confirm" }),
    ).resolves.toMatchObject({ id: "token-1" });
  });

  it("fails lazily on a short DIMAH_S3_SECRET", async () => {
    vi.stubEnv("DIMAH_S3_SECRET", "too-short");
    await expect(read(env({ secret: undefined }))).rejects.toThrow(
      new ConfigError("DIMAH_S3_SECRET must have at least 32 characters."),
    );
  });

  it.each([
    ["production", "production"],
    ["unset", undefined],
    ["staging", "staging"],
  ])("is a config error with NODE_ENV %s", async (_, nodeEnv) => {
    vi.stubEnv("NODE_ENV", nodeEnv);
    const issue = read(env({ secret: undefined }));

    await expect(issue).rejects.toBeInstanceOf(ConfigError);
    await expect(issue).rejects.toThrow(/Set DIMAH_S3_SECRET/);
  });

  it.each(["development", "test"])(
    "uses one random secret with NODE_ENV %s and warns once",
    async (nodeEnv) => {
      vi.stubEnv("NODE_ENV", nodeEnv);
      const warn = vi.fn();
      const devEnv = env({ secret: undefined, logger: { warn } });

      const { ticket } = await read(devEnv);
      await read(devEnv);

      expect(warn).toHaveBeenCalledExactlyOnceWith(
        expect.stringMatching(/DIMAH_S3_SECRET is not set/),
      );
      // A second instance (after a hot reload) reuses the secret.
      await expect(
        readTicket(env({ secret: undefined, logger: {} }), ticket, {
          mode: "single",
          operation: "confirm",
        }),
      ).resolves.toMatchObject({ id: "token-1" });
    },
  );
});

describe("parseSecretOption", () => {
  it("returns undefined when unset", () => {
    expect(parseSecretOption(undefined)).toBeUndefined();
  });

  it("wraps one secret and copies a list", () => {
    expect(parseSecretOption(TEST_SECRET)).toEqual([TEST_SECRET]);
    expect(parseSecretOption([TEST_SECRET, OTHER_SECRET])).toEqual([
      TEST_SECRET,
      OTHER_SECRET,
    ]);
  });

  it("throws on a short value or an empty list", () => {
    expect(() => parseSecretOption("short")).toThrow(/at least 32 characters/);
    expect(() => parseSecretOption([TEST_SECRET, "short"])).toThrow(
      /at least 32 characters/,
    );
    expect(() => parseSecretOption([])).toThrow(/empty array/);
  });
});

describe("createUploadToken", () => {
  it("returns 16 random bytes in base64url", () => {
    const token = createUploadToken();
    expect(token).toMatch(/^[\w-]{22}$/);
    expect(base64UrlDecode(token)).toHaveLength(16);
    expect(createUploadToken()).not.toBe(token);
  });
});
