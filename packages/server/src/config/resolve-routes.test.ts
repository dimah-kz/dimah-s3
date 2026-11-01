import { DEFAULT_INLINE_TYPES } from "@dimah-s3/core";
import { describe, expect, it, vi } from "vitest";
import { route } from "@/route";
import { mockS3 } from "@/test/harness";
import type { DimahS3Config, DimahS3RouteConfig } from "@/types/config";
import { isEnabled, isFeatureOn } from "./feature-toggle";
import {
  hookList,
  resolveRoutes,
  type ResolveRoutesOptions,
  type RoutePlugin,
} from "./resolve-routes";

const client = mockS3();
const options: ResolveRoutesOptions = { maxExpiresIn: 604_800 };

function resolve(
  routes: Record<string, DimahS3RouteConfig>,
  overrides: Partial<ResolveRoutesOptions> = {},
  instance: Pick<DimahS3Config, "client" | "bucket"> = {
    client,
    bucket: "bucket",
  },
) {
  return resolveRoutes({ ...instance, routes }, { ...options, ...overrides });
}

function resolveOne(config: DimahS3RouteConfig, name = "uploads") {
  return resolve({ [name]: config })[name];
}

function enabledUpload(config: DimahS3RouteConfig) {
  const { upload } = resolveOne(config);
  if (!isEnabled(upload)) throw new Error("expected upload");
  return upload;
}

function enabledDownload(config: DimahS3RouteConfig) {
  const { download } = resolveOne(config);
  if (!isEnabled(download)) throw new Error("expected download");
  return download;
}

describe("isFeatureOn", () => {
  it("reads toggles and honors defaultOn when omitted", () => {
    expect(isFeatureOn(undefined)).toBe(false);
    expect(isFeatureOn(undefined, true)).toBe(true);
    expect(isFeatureOn(false, true)).toBe(false);
    expect(isFeatureOn(true)).toBe(true);
    expect(isFeatureOn({ expiresIn: 60 })).toBe(true);
  });

  it("reads resolved { enabled } flags", () => {
    expect(isFeatureOn({ enabled: false })).toBe(false);
    expect(isFeatureOn({ enabled: true })).toBe(true);
  });
});

describe("hookList", () => {
  it("runs plugin hooks in plugin order, then the user hook", () => {
    const a = () => {};
    const b = () => {};
    const user = () => {};
    const plugins = [
      { id: "a", hook: a },
      { id: "none" },
      { id: "b", hook: b },
    ];

    expect(hookList(plugins, (p) => p.hook, user)).toEqual([
      { plugin: "a", hook: a },
      { plugin: "b", hook: b },
      { hook: user },
    ]);
    expect(hookList(plugins, () => undefined, undefined)).toEqual([]);
  });
});

describe("resolveRoutes: features", () => {
  it("keeps every feature off until set", () => {
    const resolved = resolveOne(route({ upload: true }));
    expect(resolved.upload.enabled).toBe(true);
    expect(resolved.upload.multipart.enabled).toBe(false);
    expect(resolved.download.enabled).toBe(false);
    expect(resolved.delete.enabled).toBe(false);
  });

  it("applies the upload defaults", () => {
    expect(enabledUpload(route({ upload: true }))).toEqual({
      enabled: true,
      acl: "private",
      method: "PUT",
      expiresIn: 600,
      confirmWindow: 3600,
      checksum: false,
      verifyContent: false,
      multipart: { enabled: false },
      guard: [],
      onStart: [],
      confirmGuard: [],
      onConfirmed: [],
    });
  });

  it("keeps the upload options", () => {
    const object = () => undefined;
    expect(
      enabledUpload(
        route({
          upload: {
            fileTypes: ["image/*"],
            maxFileSize: 1024,
            acl: "public-read",
            method: "POST",
            expiresIn: 60,
            confirmWindow: 120,
            checksum: true,
            object,
          },
        }),
      ),
    ).toMatchObject({
      fileTypes: ["image/*"],
      maxFileSize: 1024,
      acl: "public-read",
      method: "POST",
      expiresIn: 60,
      confirmWindow: 120,
      checksum: true,
      object,
    });
  });

  it("caps the upload URL TTL at the instance maxExpiresIn", () => {
    const resolved = resolve(
      { uploads: route({ upload: { expiresIn: 9000 } }) },
      { maxExpiresIn: 300 },
    ).uploads;
    if (!isEnabled(resolved.upload)) throw new Error("expected upload");
    expect(resolved.upload.expiresIn).toBe(300);
  });

  it("turns checksums on with verifyContent", () => {
    expect(
      enabledUpload(route({ upload: { verifyContent: true } })),
    ).toMatchObject({ checksum: true, verifyContent: true });
  });

  it("rejects checksum: false together with verifyContent", () => {
    expect(() =>
      resolveOne(route({ upload: { verifyContent: true, checksum: false } })),
    ).toThrow(/upload.checksum cannot be false while upload.verifyContent/);
  });

  it("applies the multipart defaults and options", () => {
    expect(
      enabledUpload(route({ upload: { multipart: true } })).multipart,
    ).toEqual({
      enabled: true,
      ticketExpiresIn: 86_400,
      guard: [],
      onAbort: [],
    });
    expect(
      enabledUpload(
        route({
          upload: {
            multipart: { partSize: 16 * 1024 * 1024, ticketExpiresIn: 600 },
          },
        }),
      ).multipart,
    ).toMatchObject({ partSize: 16 * 1024 * 1024, ticketExpiresIn: 600 });
  });

  it("keeps multipart off when upload is off", () => {
    const resolved = resolveOne(route({ upload: false, download: true }));
    expect(resolved.upload).toEqual({
      enabled: false,
      multipart: { enabled: false },
    });
  });

  it("applies the download defaults", () => {
    expect(enabledDownload(route({ download: true }))).toEqual({
      enabled: true,
      maxExpiresIn: 600,
      disposition: "attachment",
      inlineTypes: DEFAULT_INLINE_TYPES,
      mode: "presign",
      guard: [],
      onPresigned: [],
    });
  });

  it("leaves PDF out of the default inline types in proxy mode", () => {
    const { inlineTypes } = enabledDownload(
      route({ download: { mode: "proxy" } }),
    );
    expect(inlineTypes).toEqual(
      DEFAULT_INLINE_TYPES.filter((type) => type !== "application/pdf"),
    );
  });

  it("keeps configured inline types, including false", () => {
    expect(
      enabledDownload(route({ download: { inlineTypes: ["image/svg+xml"] } }))
        .inlineTypes,
    ).toEqual(["image/svg+xml"]);
    expect(
      enabledDownload(
        route({ download: { mode: "proxy", inlineTypes: false } }),
      ).inlineTypes,
    ).toBe(false);
  });

  it("caps the download TTL at the instance maxExpiresIn", () => {
    const resolved = resolve(
      { files: route({ download: { maxExpiresIn: 9000 } }) },
      { maxExpiresIn: 300 },
    ).files;
    if (!isEnabled(resolved.download)) throw new Error("expected download");
    expect(resolved.download.maxExpiresIn).toBe(300);
  });

  it("resolves delete", () => {
    expect(resolveOne(route({ delete: true })).delete).toEqual({
      enabled: true,
      guard: [],
      onDeleted: [],
    });
  });

  it.each([
    ["upload.maxFileSize", { upload: { maxFileSize: 0 } }],
    ["upload.expiresIn", { upload: { expiresIn: -1 } }],
    ["upload.confirmWindow", { upload: { confirmWindow: Number.NaN } }],
    ["upload.multipart.partSize", { upload: { multipart: { partSize: 0 } } }],
    [
      "upload.multipart.ticketExpiresIn",
      { upload: { multipart: { ticketExpiresIn: Infinity } } },
    ],
    ["download.maxExpiresIn", { download: { maxExpiresIn: 0 } }],
    ["upload.maxFileSize", { upload: { maxFileSize: 1024.5 } }],
    ["upload.expiresIn", { upload: { expiresIn: 90.5 } }],
    ["upload.confirmWindow", { upload: { confirmWindow: 0.5 } }],
    [
      "upload.multipart.partSize",
      { upload: { multipart: { partSize: 5_242_880.5 } } },
    ],
    [
      "upload.multipart.ticketExpiresIn",
      { upload: { multipart: { ticketExpiresIn: 3600.25 } } },
    ],
    ["download.maxExpiresIn", { download: { maxExpiresIn: 1.5 } }],
  ] satisfies [string, DimahS3RouteConfig][])(
    "rejects a %s that is not a positive integer",
    (field, config) => {
      expect(() => resolveOne(config)).toThrow(
        `dimahS3 route "uploads": ${field} must be a positive integer.`,
      );
    },
  );
});

describe("resolveRoutes: hooks", () => {
  const userGuard = () => {};
  const userOnConfirmed = () => {};
  const pluginGuard = () => {};
  const pluginOnConfirmed = () => {};
  const pluginOnAbort = () => {};
  const pluginOnDeleted = () => {};
  const plugin: RoutePlugin = {
    id: "db",
    hooks: {
      upload: {
        guard: pluginGuard,
        onConfirmed: pluginOnConfirmed,
        multipart: { onAbort: pluginOnAbort },
      },
      delete: { onDeleted: pluginOnDeleted },
    },
  };

  it("runs plugin hooks before user hooks, guards and lifecycle alike", () => {
    const { uploads } = resolve(
      {
        uploads: route({
          upload: {
            guard: userGuard,
            onConfirmed: userOnConfirmed,
            multipart: true,
          },
          delete: true,
        }),
      },
      { plugins: [plugin] },
    );
    if (!isEnabled(uploads.upload) || !isEnabled(uploads.upload.multipart)) {
      throw new Error("expected multipart");
    }

    expect(uploads.upload.guard).toEqual([
      { plugin: "db", hook: pluginGuard },
      { hook: userGuard },
    ]);
    expect(uploads.upload.onConfirmed).toEqual([
      { plugin: "db", hook: pluginOnConfirmed },
      { hook: userOnConfirmed },
    ]);
    expect(uploads.upload.multipart.onAbort).toEqual([
      { plugin: "db", hook: pluginOnAbort },
    ]);
    expect(uploads.delete).toMatchObject({
      onDeleted: [{ plugin: "db", hook: pluginOnDeleted }],
    });
  });

  it("skips a plugin the route turns off", () => {
    const { scratch } = resolve(
      {
        scratch: route({
          plugins: { db: false },
          upload: { onConfirmed: userOnConfirmed },
        }),
      },
      { plugins: [plugin] },
    );
    if (!isEnabled(scratch.upload)) throw new Error("expected upload");

    expect(scratch.plugins).toEqual({ db: false });
    expect(scratch.upload.guard).toEqual([]);
    expect(scratch.upload.onConfirmed).toEqual([{ hook: userOnConfirmed }]);
  });

  it("keeps plugin options that are not false", () => {
    const { uploads } = resolve(
      { uploads: route({ plugins: { db: {} }, upload: true }) },
      { plugins: [plugin] },
    );
    if (!isEnabled(uploads.upload)) throw new Error("expected upload");
    expect(uploads.upload.guard).toEqual([{ plugin: "db", hook: pluginGuard }]);
  });

  it("uses only the user route guard", () => {
    const guard = () => {};
    expect(resolveOne(route({ guard, upload: true })).guard).toEqual([
      { hook: guard },
    ]);
  });
});

describe("resolveRoutes: identity", () => {
  it("uses the route name as keyPrefix by default", () => {
    expect(resolveOne(route({ upload: true }), "avatars").keyPrefix).toBe(
      "avatars",
    );
  });

  it("accepts a custom keyPrefix or false", () => {
    expect(
      resolveOne(route({ keyPrefix: "/users/", upload: true })).keyPrefix,
    ).toBe("users");
    expect(
      resolveOne(route({ keyPrefix: false, upload: true })).keyPrefix,
    ).toBe(false);
  });

  it("rejects an unsafe keyPrefix", () => {
    expect(() =>
      resolveOne(route({ keyPrefix: "../secret", upload: true })),
    ).toThrow(/keyPrefix is not a valid object-key prefix/);
  });

  it("rejects an invalid route name", () => {
    expect(() => resolveOne(route({ upload: true }), "1bad")).toThrow(
      /route "1bad" is invalid/,
    );
  });

  it("rejects a route with every feature off", () => {
    expect(() => resolveOne(route({}))).toThrow(
      /enable upload, download, or delete/,
    );
    expect(() => resolveOne(route({ upload: false }))).toThrow(
      /enable upload, download, or delete/,
    );
  });

  it("lets a route override the client and bucket", () => {
    const other = mockS3();
    const resolved = resolveOne(
      route({ client: other, bucket: "cdn-bucket", upload: true }),
    );
    expect(resolved.client).toBe(other);
    expect(resolved.bucket).toBe("cdn-bucket");
  });

  it("requires a client and a bucket on the instance or the route", () => {
    expect(() => resolve({ uploads: route({ upload: true }) }, {}, {})).toThrow(
      /set client/,
    );
    expect(() =>
      resolve({ uploads: route({ upload: true }) }, {}, { client }),
    ).toThrow(/set bucket/);
  });

  it("requires at least one route", () => {
    expect(() => resolve({})).toThrow(/at least one route/);
  });

  it.each([
    ["nested", "media", "media/private"],
    ["identical", "shared", "shared"],
  ])("rejects %s keyPrefix values", (_, a, b) => {
    expect(() =>
      resolve({
        a: route({ keyPrefix: a, upload: true }),
        b: route({ keyPrefix: b, upload: true }),
      }),
    ).toThrow(/routes "a" and "b" have overlapping keyPrefix/);
  });

  it("allows sibling prefixes", () => {
    expect(() =>
      resolve({
        a: route({ keyPrefix: "media", upload: true }),
        b: route({ keyPrefix: "media-private", upload: true }),
      }),
    ).not.toThrow();
  });

  it("allows one prefix on different buckets", () => {
    expect(() =>
      resolve({
        a: route({ keyPrefix: "media", upload: true }),
        b: route({ keyPrefix: "media", bucket: "archive", upload: true }),
      }),
    ).not.toThrow();
  });

  it("warns when an unbound route shares a bucket", () => {
    const warn = vi.fn();
    expect(() =>
      resolve(
        {
          a: route({ keyPrefix: "media", upload: true }),
          c: route({ keyPrefix: false, upload: true }),
          d: route({ keyPrefix: false, bucket: "other", upload: true }),
        },
        { logger: { warn } },
      ),
    ).not.toThrow();
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toMatch(/route "c" sets keyPrefix: false/);
  });
});
