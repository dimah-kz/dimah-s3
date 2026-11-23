import { describe, expect, it } from "vitest";

import { assertSupportedNode, cliVersion } from "@/runtime";
import { CliError } from "@/utils/errors";
import { cliPkg } from "./helpers.js";

describe("cliVersion", () => {
  it("reads the package version", () => {
    expect(cliVersion()).toMatch(/^\d+\.\d+\.\d+/);
  });
});

describe("engines", () => {
  it("declares the floor the runtime check enforces", () => {
    expect(cliPkg.engines.node).toBe(">=22");
  });
});

describe("assertSupportedNode", () => {
  it("allows supported versions and rejects below the floor", () => {
    expect(() => assertSupportedNode("22.0.0")).not.toThrow();
    expect(() => assertSupportedNode("24.0.0")).not.toThrow();
    expect(() => assertSupportedNode("20.19.0")).toThrow(CliError);
    expect(() => assertSupportedNode("18.20.0")).toThrow(/Node\.js 22/);
  });
});
