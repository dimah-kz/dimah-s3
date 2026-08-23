import { describe, expect, it, vi } from "vitest";
import { definePlugin } from "@/index";
import { applyPlugins } from "./apply-plugins";
import { createS3Endpoint } from "@/api/create-s3-endpoint";
import type { DimahS3Config } from "@/types";

function config(
  plugins?: DimahS3Config["plugins"],
  extra: Partial<DimahS3Config> = {},
): DimahS3Config & { plugins?: DimahS3Config["plugins"] } {
  return {
    client: {} as DimahS3Config["client"],
    bucket: "bucket",
    plugins,
    ...extra,
  };
}

describe("applyPlugins validation", () => {
  it("rejects reserved ids", () => {
    expect(() =>
      applyPlugins(config([definePlugin({ id: "handler", context: {} })])),
    ).toThrow(/reserved/);
  });

  it("rejects duplicate ids", () => {
    expect(() =>
      applyPlugins(
        config([
          definePlugin({ id: "a", context: {} }),
          definePlugin({ id: "a", context: {} }),
        ]),
      ),
    ).toThrow(/Duplicate/);
  });

  it("rejects missing dependsOn", () => {
    expect(() =>
      applyPlugins(config([definePlugin({ id: "a", dependsOn: ["missing"] })])),
    ).toThrow(/not registered/);
  });

  it("rejects circular dependsOn", () => {
    expect(() =>
      applyPlugins(
        config([
          definePlugin({ id: "a", dependsOn: ["b"] }),
          definePlugin({ id: "b", dependsOn: ["a"] }),
        ]),
      ),
    ).toThrow(/Circular/);
  });

  it("accepts a satisfied dependsOn graph", () => {
    expect(() =>
      applyPlugins(
        config([
          definePlugin({ id: "base", context: {} }),
          definePlugin({ id: "child", dependsOn: ["base"] }),
        ]),
      ),
    ).not.toThrow();
  });

  it("rejects endpoint paths without a leading slash", () => {
    expect(() =>
      applyPlugins(
        config([
          definePlugin({
            id: "audit",
            endpoints: {
              recent: {
                path: "recent",
                options: { method: "GET" },
              } as never,
            },
          }),
        ]),
      ),
    ).toThrow(/must start with "\/"/);
  });

  it("rejects plugin endpoints that collide with a core route path", () => {
    expect(() =>
      applyPlugins(
        config([
          definePlugin({
            id: "audit",
            endpoints: {
              stolen: createS3Endpoint(
                "/presign/download",
                { method: "GET" },
                async () => ({}),
              ),
            },
          }),
        ]),
      ),
    ).toThrow(/collides with a core route/);
  });

  it("rejects plugin endpoints that reuse a core endpoint name", () => {
    expect(() =>
      applyPlugins(
        config([
          definePlugin({
            id: "audit",
            endpoints: {
              download: createS3Endpoint(
                "/audit/download",
                { method: "GET" },
                async () => ({}),
              ),
            },
          }),
        ]),
      ),
    ).toThrow(/collides with an existing endpoint/);
  });

  it("rejects duplicate plugin method+path pairs", () => {
    expect(() =>
      applyPlugins(
        config([
          definePlugin({
            id: "a",
            endpoints: {
              one: createS3Endpoint(
                "/audit/recent",
                { method: "GET" },
                async () => ({}),
              ),
            },
          }),
          definePlugin({
            id: "b",
            endpoints: {
              two: createS3Endpoint(
                "/audit/recent",
                { method: "GET" },
                async () => ({}),
              ),
            },
          }),
        ]),
      ),
    ).toThrow(/Duplicate plugin endpoint/);
  });
});

describe("applyPlugins merge", () => {
  it("runs plugin hooks before user hooks", async () => {
    const order: string[] = [];
    const merged = applyPlugins({
      ...config([
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

  it("merges feature hooks plugins-first", async () => {
    const order: string[] = [];
    const merged = applyPlugins({
      ...config([
        definePlugin({
          id: "p",
          hooks: {
            upload: {
              guard: () => {
                order.push("plugin");
              },
            },
          },
        }),
      ]),
      upload: {
        guard: () => {
          order.push("user");
        },
      },
    });

    await merged.config.upload?.guard?.({
      request: new Request("http://localhost"),
      key: "a.png",
      bucket: "bucket",
    });
    expect(merged.config.upload?.enabled).toBe(true);
    expect(order).toEqual(["plugin", "user"]);
  });

  it("builds context and runs init", () => {
    const init = vi.fn();
    const plugin = definePlugin({
      id: "audit",
      context: { n: 1 },
      init: (env) => {
        init(env.getPlugin("audit")?.id, env.config.bucket);
      },
    });

    const merged = applyPlugins(config([plugin]));
    expect(merged.context.audit).toEqual({ n: 1 });
    expect(merged.getPlugin("audit")).toBe(plugin);
    expect(init).toHaveBeenCalledWith("audit", "bucket");
  });

  it("does not merge plugin prefix onto user key policy", () => {
    const merged = applyPlugins({
      ...config([
        definePlugin({
          id: "p",
          hooks: {
            upload: {
              guard: () => undefined,
              prefix: "plugin",
            } as never,
          },
        }),
      ]),
      upload: { prefix: "uploads" },
    });

    expect(merged.config.upload?.prefix).toBe("uploads");
  });
});

describe("applyPlugins config validation", () => {
  it("rejects allowClientBucket together with buckets", () => {
    expect(() =>
      applyPlugins(
        config(undefined, {
          allowClientBucket: true,
          buckets: ["bucket"],
        }),
      ),
    ).toThrow(/allowClientBucket or buckets/);
  });
});
