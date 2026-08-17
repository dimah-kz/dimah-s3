import { describe, expect, it } from "vitest";
import {
  S3_API_BASE_PATH,
  S3_API_ROUTES,
  normalizeS3ApiBasePath,
} from "./routes";

describe("normalizeS3ApiBasePath", () => {
  it.each([
    ["/api/s3/", "/api/s3"],
    ["/api/s3", "/api/s3"],
    ["/s3/", "/s3"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeS3ApiBasePath(input)).toBe(expected);
  });
});

describe("S3_API_ROUTES", () => {
  it("keeps the default mount path", () => {
    expect(S3_API_BASE_PATH).toBe("/api/s3");
  });

  it("uses absolute paths under the mount", () => {
    const paths = Object.values(S3_API_ROUTES);
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) {
      expect(path.startsWith("/")).toBe(true);
      expect(path.endsWith("/")).toBe(false);
    }
  });
});
