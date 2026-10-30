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

  it("uses the global fetch when none is given", async () => {
    const { fetch, calls } = captureFetch();
    vi.stubGlobal("fetch", fetch);
    await createS3Fetch("/api/s3")("/routes", { method: "GET" });
    expect(calls).toHaveLength(1);
  });
});
