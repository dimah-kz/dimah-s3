import { describe, expect, it, vi } from "vitest";
import { route } from "@/route";
import { createTestInstance } from "@/testing/test-instance";
import { definePlugin } from "./define-plugin";
import type { PluginInitEnv } from "./types";

/** A test instance with a plugin that keeps its env. */
function setup() {
  let env: PluginInitEnv<"grants"> | undefined;
  const plugin = definePlugin({
    id: "grants",
    init: (initEnv) => {
      env = initEnv;
    },
  });
  const instance = createTestInstance({
    plugins: [plugin],
    routes: {
      files: route({ download: { maxExpiresIn: 600 } }),
      proxied: route({ download: { mode: "proxy" } }),
      private: route({ upload: true }),
    },
  });
  if (!env) throw new Error("init did not run");
  instance.storage.seed("files/a.txt", "hello", { contentType: "text/plain" });
  instance.storage.seed("files/page.html", "<p>hi</p>", {
    contentType: "text/html",
  });
  instance.storage.seed("proxied/a.txt", "hello world", {
    contentType: "text/plain",
  });
  return { env, ...instance };
}

describe("PluginInitEnv.download.presign", () => {
  it("signs a GET with the name, the disposition, and a capped lifetime", async () => {
    const { env } = setup();
    const signed = await env.download.presign({
      route: "files",
      key: "files/a.txt",
      name: "report.txt",
      disposition: "inline",
      expiresIn: 3600,
    });

    expect(signed.expiresIn).toBe(600);
    expect(signed.disposition).toBe("inline");
    const url = new URL(signed.url);
    expect(url.pathname).toContain("files/a.txt");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("600");
    expect(url.searchParams.get("response-content-disposition")).toContain(
      "report.txt",
    );
  });

  it("defaults to the route's lifetime and disposition", async () => {
    const { env } = setup();
    const signed = await env.download.presign({
      route: "files",
      key: "files/a.txt",
    });
    expect(signed).toMatchObject({ expiresIn: 600, disposition: "attachment" });
  });

  it("keeps inline only for the route's inline types", async () => {
    const { env } = setup();
    const signed = await env.download.presign({
      route: "files",
      key: "files/page.html",
      disposition: "inline",
    });
    expect(signed.disposition).toBe("attachment");
  });

  it("rejects a route without downloads, a key outside it, and a missing object", async () => {
    const { env } = setup();
    await expect(
      env.download.presign({ route: "private", key: "private/a.txt" }),
    ).rejects.toMatchObject({
      code: "FEATURE_DISABLED",
    });
    await expect(
      env.download.presign({ route: "files", key: "other/a.txt" }),
    ).rejects.toMatchObject({
      code: "KEY_INVALID",
    });
    await expect(
      env.download.presign({ route: "files", key: "files/missing.txt" }),
    ).rejects.toMatchObject({
      code: "OBJECT_NOT_FOUND",
    });
    await expect(
      env.download.presign({ route: "nope", key: "nope/a.txt" }),
    ).rejects.toMatchObject({
      code: "ROUTE_NOT_FOUND",
    });
  });

  it("refuses a route in proxy mode and a bad lifetime as plugin bugs", async () => {
    const { env } = setup();
    await expect(
      env.download.presign({ route: "proxied", key: "proxied/a.txt" }),
    ).rejects.toThrow(/download\.serve/);
    await expect(
      env.download.presign({
        route: "files",
        key: "files/a.txt",
        expiresIn: 0,
      }),
    ).rejects.toThrow(TypeError);
  });
});

describe("PluginInitEnv.download.serve", () => {
  it("streams the object with the /file headers", async () => {
    const { env } = setup();
    const response = await env.download.serve(
      { route: "proxied", key: "proxied/a.txt", name: "notes.txt" },
      new Request("https://app.test/file"),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("hello world");
    expect(response.headers.get("content-type")).toBe("text/plain");
    expect(response.headers.get("content-disposition")).toContain("notes.txt");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cache-control")).toBe("private, no-cache");
  });

  it("forwards a byte range and a custom Cache-Control", async () => {
    const { env } = setup();
    const response = await env.download.serve(
      { route: "proxied", key: "proxied/a.txt", cacheControl: "no-store" },
      new Request("https://app.test/file", { headers: { range: "bytes=0-4" } }),
    );

    expect(response.status).toBe(206);
    expect(await response.text()).toBe("hello");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("throws OBJECT_NOT_FOUND with the hardening headers", async () => {
    const { env } = setup();
    const failure = env.download.serve(
      { route: "proxied", key: "proxied/missing.txt" },
      new Request("https://app.test/file"),
    );
    const error: unknown = await failure.catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: "OBJECT_NOT_FOUND" });
    const headers = new Headers((error as { headers?: HeadersInit }).headers);
    expect(headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("refuses a route in presign mode as a plugin bug", async () => {
    const { env } = setup();
    await expect(
      env.download.serve(
        { route: "files", key: "files/a.txt" },
        new Request("https://app.test/file"),
      ),
    ).rejects.toThrow(/download\.presign/);
  });
});

describe("PluginInitEnv.url", () => {
  it("builds API URLs under basePath, or under baseURL when it is set", () => {
    const { env } = setup();
    expect(env.url("/grants/file")).toBe("/api/s3/grants/file");

    let absolute: PluginInitEnv | undefined;
    createTestInstance({
      baseURL: "https://app.test/storage/",
      plugins: [
        definePlugin({
          id: "grants",
          init: (initEnv) => {
            absolute = initEnv;
          },
        }),
      ],
      routes: { files: route({ download: true }) },
    });
    expect(absolute?.url("/grants/file")).toBe(
      "https://app.test/storage/grants/file",
    );
  });
});

describe("PluginInitEnv.tokens", () => {
  it("round-trips a payload for the same purpose", async () => {
    const { env } = setup();
    const grants = env.tokens("grant");
    const token = await grants.sign({ id: "l1", n: 2 }, { expiresIn: 60 });
    await expect(grants.verify(token)).resolves.toEqual({ id: "l1", n: 2 });
  });

  it("does not verify a token of another purpose, or a changed one", async () => {
    const { env } = setup();
    const token = await env
      .tokens("grant")
      .sign({ id: "l1" }, { expiresIn: 60 });
    await expect(env.tokens("unlock").verify(token)).resolves.toBeNull();

    const [body, signature] = token.split(".");
    const forged = `${body}x.${signature}`;
    await expect(env.tokens("grant").verify(forged)).resolves.toBeNull();
    await expect(env.tokens("grant").verify("garbage")).resolves.toBeNull();
  });

  it("returns null once the token expired", async () => {
    const { env } = setup();
    const grants = env.tokens("grant");
    const token = await grants.sign({ id: "l1" }, { expiresIn: 1 });
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(Date.now() + 5_000);
      await expect(grants.verify(token)).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects a reserved exp field, a bad lifetime, and a bad purpose", async () => {
    const { env } = setup();
    await expect(
      env.tokens("grant").sign({ exp: 1 }, { expiresIn: 60 }),
    ).rejects.toThrow(TypeError);
    await expect(
      env.tokens("grant").sign({ id: "l1" }, { expiresIn: 1.5 }),
    ).rejects.toThrow(TypeError);
    expect(() => env.tokens("")).toThrow(TypeError);
    expect(() => env.tokens("a/b")).toThrow(TypeError);
  });
});
