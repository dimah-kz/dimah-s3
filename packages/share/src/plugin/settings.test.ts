import { describe, expect, it } from "vitest";
import type { DimahS3ShareClient } from "@/fuma-db";
import { resolvePolicy } from "./settings";

const client = {} as DimahS3ShareClient;

describe("resolvePolicy", () => {
  it("applies the defaults", () => {
    expect(resolvePolicy({ client })).toEqual({
      defaultExpiresIn: 604_800,
      passwordRequired: false,
      passwordMinLength: 8,
      folders: true,
      downloadExpiresIn: 300,
      unlockExpiresIn: 3600,
    });
  });

  it("caps the default lifetime by the max, and gives never-expiring links the max", () => {
    expect(resolvePolicy({ client, expiration: { max: 3600 } })).toMatchObject({
      defaultExpiresIn: 3600,
      maxExpiresIn: 3600,
    });
    expect(
      resolvePolicy({ client, expiration: { default: null, max: 60 } }),
    ).toMatchObject({ defaultExpiresIn: 60 });
    expect(
      resolvePolicy({ client, expiration: { default: null } }),
    ).toMatchObject({ defaultExpiresIn: null });
  });

  it("rejects a lifetime or length that is not a positive integer", () => {
    expect(() => resolvePolicy({ client, expiration: { max: 0 } })).toThrow(
      /expiration\.max/,
    );
    expect(() => resolvePolicy({ client, downloadExpiresIn: 1.5 })).toThrow(
      /downloadExpiresIn/,
    );
    expect(() =>
      resolvePolicy({ client, password: { minLength: -1 } }),
    ).toThrow(/password\.minLength/);
  });
});
