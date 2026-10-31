import { afterEach, describe, expect, it, vi } from "vitest";
import { APIError } from "@/error";
import { captureFetch, jsonResponse } from "@/test/http";
import { createS3Fetch } from "./create-s3-fetch";

describe("createS3Fetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("prefixes paths with the base", async () => {
    const { fetch, calls } = captureFetch();
    await createS3Fetch("/api/s3", { fetch })("/db/objects", { method: "GET" });
    expect(calls[0]?.url).toBe("/api/s3/db/objects");
  });

  it("applies client headers first and lets per-call headers win", async () => {
    const { fetch, calls } = captureFetch();
    const $fetch = createS3Fetch("/api/s3", {
      fetch,
      headers: async () => ({ "X-Tenant": "a", "X-Client": "web" }),
    });
    await $fetch("/db/objects", {
      method: "GET",
      headers: { "X-Tenant": "b" },
    });

    const sent = new Headers(calls[0]?.init.headers);
    expect(sent.get("x-tenant")).toBe("b");
    expect(sent.get("x-client")).toBe("web");
  });

  it("maps errors from plugin routes onto APIError", async () => {
    const $fetch = createS3Fetch("/api/s3", {
      fetch: async () =>
        jsonResponse(
          { code: "FOLDER_NOT_EMPTY", message: "Folder is not empty" },
          409,
        ),
    });

    const error: unknown = await $fetch("/db/folder", {
      method: "DELETE",
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(APIError);
    expect(error).toMatchObject({ statusCode: 409, code: "FOLDER_NOT_EMPTY" });
  });

  it("maps a failed request onto NETWORK_ERROR with the cause", async () => {
    const cause = new TypeError("Failed to fetch");
    const $fetch = createS3Fetch("/api/s3", {
      fetch: async () => {
        throw cause;
      },
    });

    await expect($fetch("/routes", { method: "GET" })).rejects.toMatchObject({
      name: "APIError",
      code: "NETWORK_ERROR",
      statusCode: 502,
      cause,
    });
  });

  it("rethrows the abort reason instead of NETWORK_ERROR", async () => {
    const controller = new AbortController();
    const reason = new DOMException("Stopped", "AbortError");
    const $fetch = createS3Fetch("/api/s3", {
      fetch: async () => {
        controller.abort(reason);
        throw reason;
      },
    });

    await expect(
      $fetch("/routes", { method: "GET", signal: controller.signal }),
    ).rejects.toBe(reason);
  });

  it("keeps a coded error when a params value is not a string or number", async () => {
    const $fetch = createS3Fetch("/api/s3", {
      fetch: async () =>
        jsonResponse(
          {
            code: "QUOTA_EXCEEDED",
            message: "m",
            params: { limit: "bytes", over: true },
          },
          403,
        ),
    });

    await expect(
      $fetch("/upload", { method: "POST", body: {} }),
    ).rejects.toMatchObject({
      code: "QUOTA_EXCEEDED",
      statusCode: 403,
      body: { params: { limit: "bytes" } },
    });
  });

  it.each([
    [
      "an HTML fallback page",
      () =>
        new Response("<html></html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
    ],
    ["a JSON string", () => jsonResponse("ok")],
    ["JSON null", () => jsonResponse(null)],
    [
      "a binary body",
      () =>
        new Response(new Uint8Array([1, 2]), {
          status: 200,
          headers: { "content-type": "application/octet-stream" },
        }),
    ],
  ])("throws UNKNOWN_ERROR for a 2xx with %s", async (_label, respond) => {
    const $fetch = createS3Fetch("/api/s3", { fetch: async () => respond() });

    const error: unknown = await $fetch("/routes", { method: "GET" }).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(APIError);
    expect(error).toMatchObject({ code: "UNKNOWN_ERROR", statusCode: 200 });
  });

  it("resolves a 2xx JSON object or array body", async () => {
    const $fetch = createS3Fetch("/api/s3", {
      fetch: async () => jsonResponse({ routes: [] }),
    });
    await expect($fetch("/routes", { method: "GET" })).resolves.toEqual({
      routes: [],
    });

    const list = createS3Fetch("/api/s3", {
      fetch: async () => jsonResponse([1]),
    });
    await expect(list("/routes", { method: "GET" })).resolves.toEqual([1]);
  });

  it("uses the global fetch when none is given", async () => {
    const { fetch, calls } = captureFetch();
    vi.stubGlobal("fetch", fetch);
    await createS3Fetch("/api/s3")("/routes", { method: "GET" });
    expect(calls).toHaveLength(1);
  });
});
