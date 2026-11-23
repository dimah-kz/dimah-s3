import { describe, expect, it } from "vitest";

import {
  detectPackageManager,
  installCommand,
  parsePackageManagerFlag,
  runDevCommand,
} from "@/utils/package-manager";
import {
  assertProjectName,
  assertValidPackageName,
  sanitizeProjectName,
} from "@/utils/project-name";
import { CliError } from "@/utils/errors";

describe("sanitizeProjectName", () => {
  it("uses the last path segment", () => {
    expect(sanitizeProjectName("apps/My App")).toBe("my-app");
  });

  it("returns an empty name when no usable character is left", () => {
    expect(sanitizeProjectName("   ")).toBe("");
    expect(sanitizeProjectName("___")).toBe("");
    expect(sanitizeProjectName("پروژه")).toBe("");
  });
});

describe("assertProjectName", () => {
  it("refuses a directory that gives no name instead of inventing one", () => {
    expect(() => assertProjectName("", "پروژه")).toThrow(CliError);
    expect(() => assertProjectName("", "پروژه")).toThrow(/"پروژه"/);
  });

  it("accepts a usable name", () => {
    expect(() => assertProjectName("my-app", "My App")).not.toThrow();
  });
});

describe("assertValidPackageName", () => {
  it("accepts valid names", () => {
    expect(() => assertValidPackageName("my-app")).not.toThrow();
  });

  it("rejects invalid names", () => {
    expect(() => assertValidPackageName("UPPER")).toThrow(CliError);
    expect(() => assertValidPackageName("")).toThrow(/empty/);
    expect(() => assertValidPackageName("_private")).toThrow(CliError);
    expect(() => assertValidPackageName("a".repeat(215))).toThrow(/214/);
  });

  it("rejects names npm reserves and Node.js core modules", () => {
    expect(() => assertValidPackageName("node_modules")).toThrow(/reserved/);
    expect(() => assertValidPackageName("http")).toThrow(/core module/);
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

  it("returns undefined when the flag is omitted", () => {
    expect(parsePackageManagerFlag(undefined)).toBeUndefined();
  });
});

describe("package manager commands", () => {
  it.each([
    ["pnpm", "pnpm install", "pnpm dev"],
    ["npm", "npm install", "npm run dev"],
    ["yarn", "yarn", "yarn dev"],
    ["bun", "bun install", "bun run dev"],
  ] as const)("%s", (pm, install, dev) => {
    expect(installCommand(pm)).toBe(install);
    expect(runDevCommand(pm)).toBe(dev);
  });
});
