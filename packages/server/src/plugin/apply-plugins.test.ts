import { describe, expect, it } from "vitest";
import { applyPlugins, definePlugin, FEATURE_HOOK_KEYS } from "../index";
import type { DimahS3Config } from "../types";

function baseConfig(
  plugins?: DimahS3Config["plugins"],
): DimahS3Config & { plugins?: DimahS3Config["plugins"] } {
  return {
    s3: {} as DimahS3Config["s3"],
    defaultBucket: "bucket",
    plugins,
  };
}

describe("FEATURE_HOOK_KEYS", () => {
  it("uses renamed hook keys", () => {
    expect(FEATURE_HOOK_KEYS.upload).toContain("onConfirmed");
    expect(FEATURE_HOOK_KEYS.delete).toContain("guard");
    expect(FEATURE_HOOK_KEYS.delete).not.toContain("deleteGuard");
  });
});

describe("applyPlugins", () => {
  it("rejects reserved ids", () => {
    expect(() =>
      applyPlugins(baseConfig([definePlugin({ id: "handler", context: {} })])),
    ).toThrow(/reserved/);
  });

  it("rejects duplicates", () => {
    expect(() =>
      applyPlugins(
        baseConfig([
          definePlugin({ id: "a", context: {} }),
          definePlugin({ id: "a", context: {} }),
        ]),
      ),
    ).toThrow(/Duplicate/);
  });

  it("rejects missing dependsOn", () => {
    expect(() =>
      applyPlugins(
        baseConfig([definePlugin({ id: "a", dependsOn: ["missing"] })]),
      ),
    ).toThrow(/not registered/);
  });

  it("rejects circular dependsOn", () => {
    expect(() =>
      applyPlugins(
        baseConfig([
          definePlugin({ id: "a", dependsOn: ["b"] }),
          definePlugin({ id: "b", dependsOn: ["a"] }),
        ]),
      ),
    ).toThrow(/Circular/);
  });

  it("merges hooks plugins-first", async () => {
    const order: string[] = [];
    const merged = applyPlugins({
      ...baseConfig([
        definePlugin({
          id: "p",
          hooks: {
            guard: () => {
              order.push("plugin");
            },
          },
        }),
      ]),
      guard: () => {
        order.push("user");
      },
    });

    await merged.config.guard?.({
      request: new Request("http://localhost"),
    });
    expect(order).toEqual(["plugin", "user"]);
  });
});
