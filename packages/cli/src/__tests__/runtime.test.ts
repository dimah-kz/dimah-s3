import { describe, expect, it } from "vitest";

import { assertSupportedNode, cliVersion } from "../runtime.js";
import { CliError } from "../utils/errors.js";

describe("cliVersion", () => {
  it("reads the package version", () => {
    expect(cliVersion()).toMatch(/^\d+\.\d+\.\d+/);
  });
});

describe("assertSupportedNode", () => {
  it("allows the minimum supported version", () => {
    expect(() => assertSupportedNode("20.19.0")).not.toThrow();
  });

  it("allows newer majors", () => {
    expect(() => assertSupportedNode("24.0.0")).not.toThrow();
  });

  it("rejects versions below the floor", () => {
    expect(() => assertSupportedNode("20.18.9")).toThrow(CliError);
    expect(() => assertSupportedNode("18.20.0")).toThrow(/20\.19/);
  });
});
