import { describe, expect, it } from "vitest";
import {
  isEnabled,
  isFeatureOn,
  normalizeFeature,
  normalizeRoute,
  normalizeRoutes,
} from "./features";
import { route } from "@/route";
import type { DimahS3Config } from "@/types";

const client = {} as NonNullable<DimahS3Config["client"]>;

describe("normalizeFeature / routes", () => {
  it("treats a bare true as enabled", () => {
    expect(normalizeFeature(true)).toEqual({ enabled: true });
  });

  it("treats omit or false as disabled", () => {
    expect(normalizeFeature(undefined)).toEqual({ enabled: false });
    expect(normalizeFeature(false)).toEqual({ enabled: false });
  });

  it("honors defaultOn when the toggle is omitted", () => {
    expect(normalizeFeature(undefined, true)).toEqual({ enabled: true });
    expect(normalizeFeature(false, true)).toEqual({ enabled: false });
  });

  it("treats an options object as enabled", () => {
    expect(normalizeFeature({ expiresIn: 60 })).toEqual({
      expiresIn: 60,
      enabled: true,
    });
  });

  it("defaults upload on and other features off", () => {
    const resolved = normalizeRoute("uploads", route({}), {
      client,
      bucket: "bucket",
    });
    expect(resolved.upload.enabled).toBe(true);
    expect(resolved.download.enabled).toBe(false);
    expect(resolved.delete.enabled).toBe(false);
    if (!isEnabled(resolved.upload)) throw new Error("expected upload");
    expect(resolved.upload.multipart.enabled).toBe(false);
  });

  it("keeps file constraints on the upload policy", () => {
    const resolved = normalizeRoute(
      "uploads",
      route({
        upload: {
          fileTypes: ["image/*"],
          maxFileSize: 1024,
          acl: "public-read",
          method: "PUT",
        },
      }),
      { client, bucket: "bucket" },
    );
    if (!isEnabled(resolved.upload)) throw new Error("expected upload");
    expect(resolved.upload.fileTypes).toEqual(["image/*"]);
    expect(resolved.upload.maxFileSize).toBe(1024);
    expect(resolved.upload.acl).toBe("public-read");
    expect(resolved.upload.method).toBe("PUT");
    expect(resolved).not.toHaveProperty("fileTypes");
    expect(resolved).not.toHaveProperty("expiresIn");
    expect(resolved.keyPrefix).toBe("uploads");
  });

  it("uses the route name as keyPrefix by default", () => {
    const resolved = normalizeRoute("avatars", route({}), {
      client,
      bucket: "bucket",
    });
    expect(resolved.keyPrefix).toBe("avatars");
  });

  it("accepts a custom keyPrefix or false", () => {
    expect(
      normalizeRoute("uploads", route({ keyPrefix: "users" }), {
        client,
        bucket: "bucket",
      }).keyPrefix,
    ).toBe("users");
    expect(
      normalizeRoute("uploads", route({ keyPrefix: false }), {
        client,
        bucket: "bucket",
      }).keyPrefix,
    ).toBe(false);
  });

  it("rejects an unsafe keyPrefix at init", () => {
    expect(() =>
      normalizeRoute("uploads", route({ keyPrefix: "../secret" }), {
        client,
        bucket: "bucket",
      }),
    ).toThrow(/keyPrefix is not a valid object-key prefix/);
  });

  it("does not enable multipart unless opted in under upload", () => {
    const resolved = normalizeRoute(
      "uploads",
      route({ upload: { multipart: false } }),
      { client, bucket: "bucket" },
    );
    if (!isEnabled(resolved.upload)) throw new Error("expected upload");
    expect(resolved.upload.multipart.enabled).toBe(false);
  });

  it("enables multipart on the upload policy", () => {
    const resolved = normalizeRoute(
      "videos",
      route({ upload: { multipart: true } }),
      { client, bucket: "bucket" },
    );
    expect(resolved.upload.enabled).toBe(true);
    if (!isEnabled(resolved.upload)) throw new Error("expected upload");
    expect(resolved.upload.multipart.enabled).toBe(true);
  });

  it("keeps multipart off when upload is disabled", () => {
    const resolved = normalizeRoute(
      "files",
      route({ upload: false, download: true }),
      { client, bucket: "bucket" },
    );
    expect(resolved.upload.enabled).toBe(false);
    expect(resolved.upload.multipart.enabled).toBe(false);
  });

  it("rejects a route with every feature off", () => {
    expect(() =>
      normalizeRoute("empty", route({ upload: false }), {
        client,
        bucket: "bucket",
      }),
    ).toThrow(/enable upload, download, or delete/);
  });

  it("allows a route-level client and bucket override", () => {
    const other = { id: "other" } as unknown as NonNullable<
      DimahS3Config["client"]
    >;
    const resolved = normalizeRoute(
      "cdn",
      route({ client: other, bucket: "cdn-bucket", upload: true }),
      { client, bucket: "bucket" },
    );
    expect(resolved.client).toBe(other);
    expect(resolved.bucket).toBe("cdn-bucket");
  });

  it("requires client and bucket on the instance or the route", () => {
    expect(() =>
      normalizeRoute("uploads", route({ upload: true }), {}),
    ).toThrow(/set client/);
    expect(() =>
      normalizeRoute("uploads", route({ upload: true }), { client }),
    ).toThrow(/set bucket/);
  });

  it("isFeatureOn matches upload-on / others-off defaults", () => {
    expect(isFeatureOn(undefined, true)).toBe(true);
    expect(isFeatureOn(undefined)).toBe(false);
    expect(isFeatureOn(false, true)).toBe(false);
    expect(isFeatureOn(true)).toBe(true);
    expect(isFeatureOn({ expiresIn: 60 })).toBe(true);
  });

  it("isFeatureOn reads resolved { enabled } flags", () => {
    expect(isFeatureOn({ enabled: false })).toBe(false);
    expect(isFeatureOn({ enabled: true })).toBe(true);
    expect(isFeatureOn({ enabled: true, expiresIn: 60 })).toBe(true);
  });

  it("requires at least one named route", () => {
    expect(() =>
      normalizeRoutes({ client, bucket: "bucket", routes: {} }),
    ).toThrow(/at least one route/);
  });
});
