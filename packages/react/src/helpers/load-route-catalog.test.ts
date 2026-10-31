import { describe, expect, it, vi } from "vitest";
import { s3Error, type RouteCatalogResponse } from "@dimah-s3/core";
import { fakeS3Api } from "@/test/api";
import {
  loadRouteCatalog,
  mergeRouteUploadPolicy,
  resolveRouteUploadPolicy,
  type RouteUploadPolicy,
} from "./load-route-catalog";

const downloadOff = { enabled: false as const };

const catalog: RouteCatalogResponse = {
  routes: {
    images: {
      upload: {
        enabled: true,
        fileTypes: ["image/*", ".pdf"],
        maxFileSize: 1000,
        multipart: true,
        checksum: true,
      },
      download: downloadOff,
      delete: { enabled: true },
    },
    readonly: {
      upload: { enabled: false },
      download: downloadOff,
      delete: { enabled: false },
    },
  },
};

const route: RouteUploadPolicy = {
  accept: ["image/*", ".pdf"],
  maxFileSize: 1000,
  multipart: true,
  checksum: true,
};

describe("loadRouteCatalog", () => {
  it("caches the catalog per S3Api", async () => {
    const api = fakeS3Api();
    await loadRouteCatalog(api);
    await loadRouteCatalog(api);
    expect(api.catalog).toHaveBeenCalledOnce();
  });

  it("does not cache a failure, and rejects with an APIError", async () => {
    const api = fakeS3Api();
    vi.mocked(api.catalog).mockRejectedValueOnce(new Error("offline"));

    await expect(loadRouteCatalog(api)).rejects.toMatchObject({
      code: "UNKNOWN_ERROR",
    });
    await expect(loadRouteCatalog(api)).resolves.toHaveProperty("routes");
    expect(api.catalog).toHaveBeenCalledTimes(2);
  });

  it("keeps a catalog error's code", async () => {
    const api = fakeS3Api();
    vi.mocked(api.catalog).mockRejectedValueOnce(s3Error("FORBIDDEN"));
    await expect(loadRouteCatalog(api)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("resolveRouteUploadPolicy", () => {
  it("reads the route's upload policy", () => {
    expect(resolveRouteUploadPolicy(catalog, "images")).toEqual(route);
  });

  it.each([
    ["a disabled route", catalog, "readonly"],
    ["a missing route", catalog, "missing"],
    ["no catalog yet", null, "images"],
  ])("allows nothing extra for %s", (_, input, name) => {
    expect(resolveRouteUploadPolicy(input, name)).toEqual({
      multipart: false,
      checksum: false,
    });
  });
});

describe("mergeRouteUploadPolicy", () => {
  it("keeps the route policy without options", () => {
    expect(mergeRouteUploadPolicy(route, {})).toEqual(route);
  });

  it("keeps the smaller maxFileSize", () => {
    expect(mergeRouteUploadPolicy(route, { maxFileSize: 10 }).maxFileSize).toBe(
      10,
    );
    expect(
      mergeRouteUploadPolicy(route, { maxFileSize: 5000 }).maxFileSize,
    ).toBe(1000);
    expect(
      mergeRouteUploadPolicy(
        { multipart: false, checksum: false },
        { maxFileSize: 10 },
      ).maxFileSize,
    ).toBe(10);
  });

  it("keeps the accept tokens both lists allow", () => {
    expect(
      mergeRouteUploadPolicy(route, { accept: ["image/png", "video/mp4"] })
        .accept,
    ).toEqual(["image/png"]);
    expect(
      mergeRouteUploadPolicy(
        { ...route, accept: ["image/png", "image/webp"] },
        { accept: ["image/*"] },
      ).accept,
    ).toEqual(["image/png", "image/webp"]);
    expect(mergeRouteUploadPolicy(route, { accept: [".PDF"] }).accept).toEqual([
      ".PDF",
    ]);
  });

  it("keeps an extension the route lists only by MIME type", () => {
    expect(
      mergeRouteUploadPolicy(
        { ...route, accept: ["image/*"] },
        { accept: [".png"] },
      ).accept,
    ).toEqual([".png"]);
  });

  it("keeps the route's list when the lists share nothing", () => {
    expect(
      mergeRouteUploadPolicy(route, { accept: ["video/*"] }).accept,
    ).toEqual(route.accept);
  });

  it("uses the option's list when the route accepts any type", () => {
    expect(
      mergeRouteUploadPolicy(
        { multipart: false, checksum: false },
        { accept: ["image/*"] },
      ).accept,
    ).toEqual(["image/*"]);
  });

  it("turns multipart on only when the route and the option allow it", () => {
    expect(mergeRouteUploadPolicy(route, { multipart: false }).multipart).toBe(
      false,
    );
    expect(mergeRouteUploadPolicy(route, { multipart: true }).multipart).toBe(
      true,
    );
    expect(
      mergeRouteUploadPolicy(
        { ...route, multipart: false },
        { multipart: true },
      ).multipart,
    ).toBe(false);
  });

  it("always takes checksum from the route", () => {
    expect(mergeRouteUploadPolicy(route, {}).checksum).toBe(true);
    expect(
      mergeRouteUploadPolicy({ ...route, checksum: false }, {}).checksum,
    ).toBe(false);
  });
});
