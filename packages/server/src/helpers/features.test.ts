import { describe, expect, it } from "vitest";
import { normalizeFeature, normalizeRoute, normalizeRoutes } from "./features";
import { route } from "@/route";
import type { DimahS3Config } from "@/types";

const client = {} as NonNullable<DimahS3Config["client"]>;

describe("normalizeFeature / routes", () => {
  it("treats a bare true as enabled", () => {
    expect(normalizeFeature(true)).toEqual({ enabled: true });
  });

  it("treats a bare false as disabled", () => {
    expect(normalizeFeature(false)).toEqual({ enabled: false });
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
    expect(resolved.upload?.enabled).toBe(true);
    expect(resolved.download?.enabled).toBeUndefined();
    expect(resolved.multipart?.enabled).toBe(false);
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
    expect(resolved.fileTypes).toEqual(["image/*"]);
    expect(resolved.maxFileSize).toBe(1024);
    expect(resolved.acl).toBe("public-read");
    expect(resolved.method).toBe("PUT");
  });

  it("does not enable multipart unless opted in", () => {
    const resolved = normalizeRoute(
      "uploads",
      route({ upload: true, multipart: false }),
      { client, bucket: "bucket" },
    );
    expect(resolved.multipart?.enabled).toBe(false);
  });

  it("rejects multipart without upload", () => {
    expect(() =>
      normalizeRoute(
        "files",
        route({ upload: false, download: true, multipart: true }),
        { client, bucket: "bucket" },
      ),
    ).toThrow(/multipart requires upload/);
  });

  it("rejects a route with every operation off", () => {
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

  it("requires at least one named route", () => {
    expect(() =>
      normalizeRoutes({ client, bucket: "bucket", routes: {} }),
    ).toThrow(/at least one route/);
  });
});
