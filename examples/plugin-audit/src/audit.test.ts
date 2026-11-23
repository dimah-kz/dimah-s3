import { isS3ErrorCode } from "@dimah-s3/core";
import { route, s3Error, type GuardContext } from "@dimah-s3/server";
import { createTestInstance } from "@dimah-s3/server/testing";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { auditClient } from "./client";
import { audit, type AuditEvent } from "./index";

function setup(guard?: (context: GuardContext) => void) {
  return createTestInstance({
    ...(guard && { guard }),
    plugins: [audit()],
    clientPlugins: [auditClient()],
    routes: {
      invoices: route({
        upload: true,
        download: true,
        delete: true,
        plugins: { audit: { downloads: true } },
      }),
      avatars: route({ upload: true, download: true }),
      drafts: route({ upload: true, plugins: { audit: false } }),
    },
  });
}

describe("audit()", () => {
  it("records confirmed uploads and deletes, newest first", async () => {
    const { s3, client, upload } = setup();

    const { key } = await upload({
      route: "invoices",
      name: "march.pdf",
      body: "pdf-bytes",
    });
    await client.delete({ route: "invoices", key });

    const { events } = await client.audit.listEvents();
    expect(events).toEqual([
      expect.objectContaining({ type: "delete", route: "invoices", key }),
      expect.objectContaining({ type: "upload", key, size: 9 }),
    ]);
    expectTypeOf(events).toEqualTypeOf<AuditEvent[]>();
    await expect(s3.audit.events({ limit: 1 })).resolves.toHaveLength(1);
  });

  it("records downloads only on routes that ask for them", async () => {
    const { s3, client, upload } = setup();
    const invoice = await upload({
      route: "invoices",
      name: "a.pdf",
      body: "a",
    });
    const avatar = await upload({ route: "avatars", name: "a.png", body: "a" });

    await client.download({ route: "invoices", key: invoice.key });
    await client.download({ route: "avatars", key: avatar.key });

    const downloads = (await s3.audit.events()).filter(
      (event) => event.type === "download",
    );
    expect(downloads).toEqual([
      expect.objectContaining({ route: "invoices", key: invoice.key }),
    ]);
  });

  it("skips a route that turns the plugin off", async () => {
    const { s3, upload } = setup();

    await upload({ route: "drafts", name: "a.txt", body: "a" });

    await expect(s3.audit.events()).resolves.toEqual([]);
  });

  it("refuses to list an untracked route with its own error code", async () => {
    const { client } = setup();

    const error: unknown = await client.audit
      .listEvents({ route: "drafts" })
      .catch((caught: unknown) => caught);

    expect(
      isS3ErrorCode(error, client.$ERROR_CODES.AUDIT_ROUTE_UNTRACKED),
    ).toBe(true);
    expect(error).toMatchObject({
      statusCode: 400,
      params: { route: "drafts" },
    });
  });

  it("names the endpoint in the guard context", async () => {
    const guard = vi.fn();
    const { client } = setup(guard);

    await client.audit.listEvents({ route: "invoices", limit: 5 });

    expect(guard).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "plugin",
        plugin: { id: "audit", action: "listEvents" },
      }),
    );
  });
});

describe("s3.audit.note", () => {
  it("runs the guards as the caller, then records the note", async () => {
    const seen: unknown[] = [];
    const { s3 } = setup((context) => {
      seen.push(context.plugin);
      if (context.request.headers.get("x-user") !== "admin") {
        throw s3Error("FORBIDDEN");
      }
    });

    await expect(
      s3.audit.note(
        { route: "invoices", key: "invoices/a.pdf", message: "Checked" },
        { headers: { "x-user": "guest" } },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const note = await s3.audit.note(
      { route: "invoices", key: "invoices/a.pdf", message: "Checked" },
      { headers: { "x-user": "admin" } },
    );

    expect(note).toMatchObject({ type: "note", message: "Checked" });
    expect(seen).toEqual([
      { id: "audit", action: "note" },
      { id: "audit", action: "note" },
    ]);
  });

  it("rejects a missing route", async () => {
    const { s3 } = setup();

    await expect(
      s3.audit.note({ route: "missing", key: "k", message: "m" }),
    ).rejects.toMatchObject({ code: "ROUTE_NOT_FOUND" });
  });
});

describe("audit() init", () => {
  it("warns when every route turns it off", () => {
    const warn = vi.fn();
    createTestInstance({
      logger: { warn },
      plugins: [audit()],
      routes: { drafts: route({ upload: true, plugins: { audit: false } }) },
    });

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("nothing is recorded"),
    );
  });
});
