import {
  buildContentDisposition,
  S3_DEFAULT_EXPIRES_IN,
  s3Error,
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
  DownloadOnPresignedContext,
  DownloadResolveContext,
  DownloadResolveInfo,
} from "@/types";
import type { ResolvedConfig, ResolvedDownload } from "@/types/resolved";
import { presignDownload } from "./download";

const KEY = "uploads/a.png";
const PDF_KEY = "uploads/plan.pdf";

function seeded(): MemoryS3 {
  const s3 = memoryS3();
  s3.seed(KEY, "0123456789", {
    contentType: "image/png",
    contentDisposition: buildContentDisposition("a.png"),
  });
  s3.seed(PDF_KEY, "%PDF-1.7", {
    contentType: "application/pdf",
    contentDisposition: buildContentDisposition("plan.pdf"),
  });
  return s3;
}

/** A resolved config whose `uploads` route has the given download settings. */
function setup(
  download: Partial<ResolvedDownload> = {},
  config: Partial<ResolvedConfig> = {},
) {
  const s3 = seeded();
  const resolved = testConfig({
    routes: {
      uploads: testRoute({
        client: s3.client,
        download: testDownload(download),
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

function signedParams(url: string): URLSearchParams {
  return new URL(url).searchParams;
}

describe("presignDownload in presign mode", () => {
  it("signs a GetObject that sends the stored name as an attachment", async () => {
    const { s3, config } = setup();

    const result = await presignDownload(config, {
      route: "uploads",
      key: KEY,
    });
    expect(result).toEqual({
      key: KEY,
      bucket: TEST_BUCKET,
      url: expect.stringMatching(
        /^https:\/\/s3\.test\/bucket\/uploads\/a\.png\?/,
      ),
      mode: "presign",
      disposition: "attachment",
      expiresIn: 600,
    });
    const params = signedParams(result.url);
    expect(params.get("response-content-disposition")).toBe(
      buildContentDisposition("a.png", "attachment"),
    );
    expect(params.has("response-content-type")).toBe(false);
    expect(params.get("X-Amz-Expires")).toBe("600");
    expect(s3.send).toHaveBeenCalledOnce();
  });

  it("sends the requested name", async () => {
    const { config } = setup();

    const { url } = await presignDownload(config, {
      route: "uploads",
      key: KEY,
      name: "résumé.png",
    });
    expect(signedParams(url).get("response-content-disposition")).toBe(
      buildContentDisposition("résumé.png", "attachment"),
    );
  });

  it("signs a shorter client expiresIn and caps a longer one at download.maxExpiresIn", async () => {
    const { config } = setup({ maxExpiresIn: 120 });

    const short = await presignDownload(config, {
      route: "uploads",
      key: KEY,
      expiresIn: 60,
    });
    const long = await presignDownload(config, {
      route: "uploads",
      key: KEY,
      expiresIn: 500,
    });
    expect(short.expiresIn).toBe(60);
    expect(signedParams(short.url).get("X-Amz-Expires")).toBe("60");
    expect(long.expiresIn).toBe(120);
    expect(signedParams(long.url).get("X-Amz-Expires")).toBe("120");
  });

  it("defaults the TTL to the protocol default when download.maxExpiresIn is unset", async () => {
    const { config } = setupFromConfig({});

    const result = await presignDownload(config, {
      route: "uploads",
      key: KEY,
    });
    expect(result.expiresIn).toBe(S3_DEFAULT_EXPIRES_IN);
    expect(signedParams(result.url).get("X-Amz-Expires")).toBe(
      String(S3_DEFAULT_EXPIRES_IN),
    );
  });

  it("lets download.resolve choose the TTL, capped by the instance maxExpiresIn", async () => {
    const { config } = setup(
      { maxExpiresIn: 120, resolve: () => ({ expiresIn: 400 }) },
      { maxExpiresIn: 3600 },
    );
    await expect(
      presignDownload(config, { route: "uploads", key: KEY, expiresIn: 60 }),
    ).resolves.toMatchObject({ expiresIn: 400 });

    const capped = setup(
      { resolve: () => ({ expiresIn: 10_000 }) },
      { maxExpiresIn: 3600 },
    );
    await expect(
      presignDownload(capped.config, { route: "uploads", key: KEY }),
    ).resolves.toMatchObject({ expiresIn: 3600 });
  });
});

describe("presignDownload inline types", () => {
  it("keeps inline for a type on inlineTypes", async () => {
    const { config } = setup();

    const result = await presignDownload(config, {
      route: "uploads",
      key: KEY,
      disposition: "inline",
    });
    expect(result.disposition).toBe("inline");
    expect(signedParams(result.url).get("response-content-disposition")).toBe(
      buildContentDisposition("a.png", "inline"),
    );
  });

  it("signs attachment for active content that a wildcard does not cover", async () => {
    const { s3, config } = setup({ inlineTypes: ["image/*"] });
    s3.seed("uploads/logo.svg", "<svg/>", { contentType: "image/svg+xml" });

    const result = await presignDownload(config, {
      route: "uploads",
      key: "uploads/logo.svg",
      disposition: "inline",
    });
    expect(result.disposition).toBe("attachment");
    expect(signedParams(result.url).get("response-content-disposition")).toBe(
      buildContentDisposition("logo.svg", "attachment"),
    );
  });

  it("types an untyped object from its name and signs that type", async () => {
    const { s3, config } = setup();
    s3.seed("uploads/blob", "%PDF-1.7", {
      contentType: "application/octet-stream",
    });

    const result = await presignDownload(config, {
      route: "uploads",
      key: "uploads/blob",
      name: "plan.pdf",
      disposition: "inline",
    });
    expect(result.disposition).toBe("inline");
    expect(signedParams(result.url).get("response-content-type")).toBe(
      "application/pdf",
    );
  });

  it("never opens inline when inlineTypes is false", async () => {
    const { config } = setup({ inlineTypes: false });

    await expect(
      presignDownload(config, {
        route: "uploads",
        key: KEY,
        disposition: "inline",
      }),
    ).resolves.toMatchObject({ disposition: "attachment" });
  });

  it("opens PDF inline by default in presign mode", async () => {
    const { config } = setupFromConfig({});

    await expect(
      presignDownload(config, {
        route: "uploads",
        key: PDF_KEY,
        disposition: "inline",
      }),
    ).resolves.toMatchObject({ disposition: "inline" });
  });

  it("uses the route disposition when the client sends none", async () => {
    const { config } = setup({ disposition: "inline" });

    await expect(
      presignDownload(config, { route: "uploads", key: KEY }),
    ).resolves.toMatchObject({ disposition: "inline" });
  });
});

describe("presignDownload in proxy mode", () => {
  it("returns a /file URL relative to the API, without expiresIn", async () => {
    const resolve = vi.fn<(context: DownloadResolveContext) => void>();
    const guard = vi.fn<(context: DownloadGuardContext) => void>();
    const { config } = setup({
      mode: "proxy",
      resolve,
      guard: [{ hook: guard }],
    });

    await expect(
      presignDownload(config, {
        route: "uploads",
        key: KEY,
        name: "a b.png",
        expiresIn: 60,
      }),
    ).resolves.toEqual({
      key: KEY,
      bucket: TEST_BUCKET,
      url: "/api/s3/file?route=uploads&key=uploads%2Fa.png&name=a+b.png&disposition=attachment",
      mode: "proxy",
      disposition: "attachment",
    });
    expect(resolve.mock.calls[0][0]).toMatchObject({
      mode: "proxy",
      expiresIn: undefined,
    });
    expect(guard.mock.calls[0][0]).toMatchObject({
      mode: "proxy",
      expiresIn: undefined,
    });
  });

  it("builds an absolute URL from baseURL", async () => {
    const { config } = setup(
      { mode: "proxy" },
      { baseURL: "https://app.example.com/api/s3/" },
    );

    await expect(
      presignDownload(config, { route: "uploads", key: KEY }),
    ).resolves.toMatchObject({
      url: "https://app.example.com/api/s3/file?route=uploads&key=uploads%2Fa.png&disposition=attachment",
    });
  });

  it("puts the effective disposition in the URL", async () => {
    const { config } = setup({ mode: "proxy" });

    const result = await presignDownload(config, {
      route: "uploads",
      key: KEY,
      disposition: "inline",
    });
    expect(result.disposition).toBe("inline");
    expect(
      new URL(result.url, "http://localhost").searchParams.get("disposition"),
    ).toBe("inline");
  });

  it("sends PDF as an attachment by default", async () => {
    const { config } = setupFromConfig({ mode: "proxy" });

    await expect(
      presignDownload(config, {
        route: "uploads",
        key: PDF_KEY,
        disposition: "inline",
      }),
    ).resolves.toMatchObject({ disposition: "attachment" });
  });
});

describe("presignDownload hooks", () => {
  it("passes the resolved values to the guard and the sent ones to onPresigned", async () => {
    const resolve = vi.fn<
      (context: DownloadResolveContext) => DownloadResolveInfo
    >(() => ({ name: "renamed.svg" }));
    const guard = vi.fn<(context: DownloadGuardContext) => void>();
    const onPresigned = vi.fn<(context: DownloadOnPresignedContext) => void>();
    const { s3, config } = setup({
      inlineTypes: ["image/*"],
      resolve,
      guard: [{ hook: guard }],
      onPresigned: [{ hook: onPresigned }],
    });
    s3.seed("uploads/logo.svg", "<svg/>", { contentType: "image/svg+xml" });

    const result = await presignDownload(config, {
      route: "uploads",
      key: "uploads/logo.svg",
      name: "logo.svg",
      disposition: "inline",
      expiresIn: 60,
    });

    const object = {
      operation: "download",
      route: "uploads",
      key: "uploads/logo.svg",
      bucket: TEST_BUCKET,
      mode: "presign",
    };
    expect(resolve.mock.calls[0][0]).toMatchObject({
      ...object,
      name: "logo.svg",
      disposition: "inline",
      expiresIn: 60,
    });
    expect(guard.mock.calls[0][0]).toMatchObject({
      ...object,
      name: "renamed.svg",
      disposition: "inline",
      expiresIn: 60,
    });
    expect(onPresigned.mock.calls[0][0]).toMatchObject({
      ...object,
      name: "renamed.svg",
      disposition: "attachment",
      expiresIn: 60,
      url: result.url,
    });
    expect(signedParams(result.url).get("response-content-disposition")).toBe(
      buildContentDisposition("renamed.svg", "attachment"),
    );
  });

  it("runs download.guard before HeadObject", async () => {
    const { s3, config } = setup({
      guard: [
        {
          hook: () => {
            throw s3Error("FORBIDDEN");
          },
        },
      ],
    });

    await expect(
      presignDownload(config, { route: "uploads", key: KEY }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", statusCode: 403 });
    expect(s3.send).not.toHaveBeenCalled();
  });

  it("forwards the request signal to HeadObject", async () => {
    const { s3, config } = setup();
    const request = new Request("http://localhost/api/s3/presign/download");

    await presignDownload(config, { route: "uploads", key: KEY }, { request });
    expect(s3.send.mock.calls[0][1]).toEqual({ abortSignal: request.signal });
  });
});

describe("presignDownload errors", () => {
  it("fails with OBJECT_NOT_FOUND for a missing object", async () => {
    const onPresigned = vi.fn();
    const { config } = setup({ onPresigned: [{ hook: onPresigned }] });

    await expect(
      presignDownload(config, { route: "uploads", key: "uploads/missing" }),
    ).rejects.toMatchObject({ code: "OBJECT_NOT_FOUND", statusCode: 404 });
    expect(onPresigned).not.toHaveBeenCalled();
  });

  it("rejects a key outside the route namespace", async () => {
    const { s3, config } = setup();

    await expect(
      presignDownload(config, { route: "uploads", key: "avatars/a.png" }),
    ).rejects.toMatchObject({ code: "KEY_INVALID" });
    expect(s3.send).not.toHaveBeenCalled();
  });

  it("rejects a route without download", async () => {
    const config = testConfig({
      routes: { uploads: testRoute({ download: { enabled: false } }) },
    });

    await expect(
      presignDownload(config, { route: "uploads", key: KEY }),
    ).rejects.toMatchObject({
      code: "FEATURE_DISABLED",
      params: { feature: "download" },
    });
  });
});
