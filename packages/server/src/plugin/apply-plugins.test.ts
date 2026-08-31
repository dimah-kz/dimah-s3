import { describe, expect, it, vi } from "vitest";
import { definePlugin } from "@/index";
import { applyPlugins } from "./apply-plugins";
import { createS3Endpoint } from "@/api/create-s3-endpoint";
import { route } from "@/route";
import { isEnabled } from "@/helpers/features";
import type { DimahS3Config } from "@/types";

function config(
  plugins?: DimahS3Config["plugins"],
  extra: Partial<DimahS3Config> = {},
): DimahS3Config & { plugins?: DimahS3Config["plugins"] } {
  return {
    client: {} as DimahS3Config["client"],
    bucket: "bucket",
    routes: {
      uploads: route({ upload: true, download: true, delete: true }),
    },
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

  it("merges feature hooks plugins-first onto each route", async () => {
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
      routes: {
        uploads: route({
          upload: {
            guard: () => {
              order.push("user");
            },
          },
        }),
      },
    });

    const upload = merged.config.routes.uploads.upload;
    if (!isEnabled(upload)) throw new Error("expected upload");
    await upload.guard?.({
      request: new Request("http://localhost"),
      route: "uploads",
      key: "a.png",
      bucket: "bucket",
    });
    expect(upload.enabled).toBe(true);
    expect(order).toEqual(["plugin", "user"]);
  });

  it("skips opted-out plugins on a route", async () => {
    const pluginGuard = vi.fn();
    const merged = applyPlugins({
      ...config([
        definePlugin({
          id: "db",
          hooks: {
            upload: { guard: pluginGuard },
          },
        }),
      ]),
      routes: {
        uploads: route({ upload: true }),
        scratch: route({ upload: true, plugins: { db: false } }),
      },
    });

    const uploads = merged.config.routes.uploads.upload;
    const scratch = merged.config.routes.scratch.upload;
    if (!isEnabled(uploads) || !isEnabled(scratch)) {
      throw new Error("expected upload");
    }
    expect(uploads.guard).toBe(pluginGuard);
    expect(scratch.guard).toBeUndefined();
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

  it("does not merge plugin scalars onto user key policy", () => {
    const merged = applyPlugins({
      ...config([
        definePlugin({
          id: "p",
          hooks: {
            upload: {
              guard: () => undefined,
              acl: "public-read",
            } as never,
          },
        }),
      ]),
      routes: {
        uploads: route({ upload: { acl: "private" } }),
      },
    });

    const upload = merged.config.routes.uploads.upload;
    if (!isEnabled(upload)) throw new Error("expected upload");
    expect(upload.acl).toBe("private");
  });

  it("merges nested upload.multipart hooks plugins-first", async () => {
    const order: string[] = [];
    const merged = applyPlugins({
      ...config([
        definePlugin({
          id: "p",
          hooks: {
            upload: {
              multipart: {
                onAbort: () => {
                  order.push("plugin");
                },
              },
            },
          },
        }),
      ]),
      routes: {
        uploads: route({
          upload: {
            multipart: {
              onAbort: () => {
                order.push("user");
              },
            },
          },
        }),
      },
    });

    const upload = merged.config.routes.uploads.upload;
    if (!isEnabled(upload) || !isEnabled(upload.multipart)) {
      throw new Error("expected multipart");
    }
    await upload.multipart.onAbort?.({
      request: new Request("http://localhost"),
      route: "uploads",
      key: "a.bin",
      bucket: "bucket",
      uploadId: "up-1",
    });
    expect(upload.multipart.enabled).toBe(true);
    expect(order).toEqual(["plugin", "user"]);
  });

  it("does not merge plugin hooks onto a disabled feature", () => {
    const downloadGuard = vi.fn();
    const multipartAbort = vi.fn();
    const merged = applyPlugins({
      ...config([
        definePlugin({
          id: "p",
          hooks: {
            download: { guard: downloadGuard },
            upload: {
              multipart: { onAbort: multipartAbort },
            },
          },
        }),
      ]),
      routes: {
        uploads: route({ upload: true }),
      },
    });

    expect(merged.config.routes.uploads.download.enabled).toBe(false);
    expect("guard" in merged.config.routes.uploads.download).toBe(false);
    const upload = merged.config.routes.uploads.upload;
    if (!isEnabled(upload)) throw new Error("expected upload");
    expect(upload.multipart.enabled).toBe(false);
    expect("onAbort" in upload.multipart).toBe(false);
  });

  it("requires at least one route", () => {
    expect(() =>
      applyPlugins({
        client: {} as DimahS3Config["client"],
        bucket: "bucket",
        routes: {},
      }),
    ).toThrow(/at least one route/);
  });
});
