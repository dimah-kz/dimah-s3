import { describe, expect, it } from "vitest";

import {
  detectPackageManager,
  parsePackageManagerFlag,
} from "../utils/package-manager.js";
import {
  assertValidPackageName,
  sanitizeProjectName,
} from "../utils/project-name.js";
import { CliError } from "../utils/errors.js";

describe("sanitizeProjectName", () => {
  it("uses the last path segment", () => {
    expect(sanitizeProjectName("apps/My App")).toBe("my-app");
  });

  it("falls back when empty", () => {
    expect(sanitizeProjectName("   ")).toBe("my-app");
  });
});

describe("assertValidPackageName", () => {
  it("accepts valid names", () => {
    expect(() => assertValidPackageName("my-app")).not.toThrow();
  });

  it("rejects invalid names", () => {
    expect(() => assertValidPackageName("UPPER")).toThrow(CliError);
  });
});

describe("detectPackageManager", () => {
  it("parses npm_config_user_agent", () => {
    expect(detectPackageManager("pnpm/11.0.0 npm/? node/v24")).toBe("pnpm");
    expect(detectPackageManager("yarn/1.22.0 npm/? node/v24")).toBe("yarn");
    expect(detectPackageManager("bun/1.0.0 npm/? node/v24")).toBe("bun");
  });

  it("defaults to npm when unset or unknown", () => {
    expect(detectPackageManager("")).toBe("npm");
    expect(detectPackageManager("mystery/1.0")).toBe("npm");
  });
});

describe("parsePackageManagerFlag", () => {
  it("accepts known managers", () => {
    expect(parsePackageManagerFlag("pnpm")).toBe("pnpm");
  });

  it("rejects unknown managers", () => {
    expect(() => parsePackageManagerFlag("deno")).toThrow(
      /Unknown package manager/,
    );
  });
});
